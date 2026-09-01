/**
 * Punjab Multi-Stop Route Planner Agent Web Application
 * CSE 476 Agentic AI - Project 1 (Topic T14)
 * OpenStreetMap & Gemini Flash API Integration
 */

// Global State
let locationsDB = {};
let locationKeys = [];
let locationLookup = {};
let selectedStops = [];
let startLocation = "Phagwara";
let map = null;
let routeMarkers = [];
let routePolyline = null;

// Memory State
const memory = {
  visited: [],
  currentLocation: "Phagwara",
  distanceCache: {},
  tripLog: [],
  totalDistance: 0.0
};

// Aliases Map for landmarks in Punjab
const ALIASES = {
  "golden temple": "Amritsar",
  "harmandir sahib": "Amritsar",
  "sri harmandir sahib": "Amritsar",
  "lpu": "Phagwara",
  "lovely professional university": "Phagwara"
};

// Initialize Application
function initApp() {
  initMap();
  loadLocations();
  setupEventListeners();
  setupTabs();
  loadApiKey();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// ---------------------------------------------------------------------------
// 1. Map Initialization (Leaflet.js)
// ---------------------------------------------------------------------------
function initMap() {
  // Center on Punjab, India
  map = L.map('map', {
    zoomControl: false
  }).setView([30.9, 75.85], 9);

  // Add Zoom Control to bottom right
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Layer 1: OpenStreetMap Standard Detailed Street Map (Full street details, highways, road names)
  const streetTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  // Layer 2: Esri World Dark Gray Base
  const darkTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  });

  // Add street tiles as default layer
  streetTiles.addTo(map);

  // Layer Switcher Control (Top Right)
  const baseMaps = {
    "🗺️ Streets & Roads (OSM)": streetTiles,
    "🌙 Dark Canvas": darkTiles
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
}

// ---------------------------------------------------------------------------
// 2. Data Loading & Search Resolution
// ---------------------------------------------------------------------------
async function loadLocations() {
  const statusLabel = document.getElementById('db-count-label');
  try {
    const res = await fetch('punjab_locations.json');
    if (!res.ok) throw new Error('Failed to load JSON');
    locationsDB = await res.json();
    locationKeys = Object.keys(locationsDB);

    // Case-insensitive lookup map
    locationKeys.forEach(k => {
      locationLookup[k.toLowerCase()] = k;
    });

    statusLabel.innerHTML = `Connected to <strong>${locationKeys.length.toLocaleString()}</strong> OSM Punjab Locations`;
  } catch (err) {
    console.error(err);
    // Fallback popular cities if fetch fails
    locationsDB = {
      "Phagwara": { lat: 31.220673, lon: 75.769646 },
      "Ludhiana": { lat: 30.909016, lon: 75.851601 },
      "Jalandhar": { lat: 31.332376, lon: 75.576889 },
      "Amritsar": { lat: 31.635666, lon: 74.878750 },
      "Patiala": { lat: 30.330199, lon: 76.400766 },
      "Mohali": { lat: 30.690880, lon: 76.711488 },
      "Moga": { lat: 30.822341, lon: 75.173097 },
      "Bathinda": { lat: 30.206791, lon: 74.946370 },
      "Rupnagar": { lat: 30.968837, lon: 76.526088 },
      "Hoshiarpur": { lat: 31.5295, lon: 75.9103 }
    };
    locationKeys = Object.keys(locationsDB);
    locationKeys.forEach(k => { locationLookup[k.toLowerCase()] = k; });
    statusLabel.innerHTML = `Loaded <strong>10 Popular</strong> Punjab Cities`;
  }
}

function resolveLocation(name) {
  if (!name) return null;
  const clean = name.trim();
  if (locationsDB[clean]) return clean;

  const lower = clean.toLowerCase();
  if (ALIASES[lower] && locationsDB[ALIASES[lower]]) return ALIASES[lower];
  if (locationLookup[lower]) return locationLookup[lower];

  // Substring match
  const subMatch = locationKeys.find(k => k.toLowerCase().includes(lower));
  if (subMatch) return subMatch;

  // Reverse substring match
  const revMatch = locationKeys.find(k => k.length > 3 && lower.includes(k.toLowerCase()));
  if (revMatch) return revMatch;

  return null;
}

function searchLocations(query) {
  if (!query || query.length < 2) return [];
  const qLower = query.toLowerCase();
  
  // Exact & prefix matches first
  const matches = locationKeys.filter(k => k.toLowerCase().includes(qLower));
  return matches.slice(0, 8);
}

// ---------------------------------------------------------------------------
// 3. Routing Engine (Haversine + 2-Opt Optimizer matching agent.py)
// ---------------------------------------------------------------------------
function getDistance(a, b) {
  const canonA = resolveLocation(a);
  const canonB = resolveLocation(b);
  if (!canonA || !canonB) return 0;

  const key = [canonA, canonB].sort().join("||");
  if (memory.distanceCache[key]) return memory.distanceCache[key];

  const p1 = locationsDB[canonA];
  const p2 = locationsDB[canonB];

  const R = 6371.0; // Earth radius km
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;

  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;

  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const dist = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  memory.distanceCache[key] = dist;
  return dist;
}

function orderStops(start, stops, returnToStart = false) {
  const canonStart = resolveLocation(start);
  const canonStops = stops.map(s => resolveLocation(s)).filter(Boolean);

  let remaining = [...canonStops];
  let route = [canonStart];
  let current = canonStart;
  let trace = [];

  // Nearest-neighbor loop
  while (remaining.length > 0) {
    let candidateDistances = {};
    let minDist = Infinity;
    let nxt = null;

    remaining.forEach(s => {
      const d = getDistance(current, s);
      candidateDistances[s] = d;
      if (d < minDist) {
        minDist = d;
        nxt = s;
      }
    });

    trace.push({
      step: trace.length + 1,
      from: current,
      considered: candidateDistances,
      decision: `go to ${nxt} (nearest at ${minDist.toFixed(2)} km)`
    });

    route.push(nxt);
    remaining = remaining.filter(s => s !== nxt);
    current = nxt;
  }

  // 2-opt repair pass
  const calculateRouteLength = (r) => {
    let sum = 0;
    for (let i = 0; i < r.length - 1; i++) {
      sum += getDistance(r[i], r[i + 1]);
    }
    return sum;
  };

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        let newRoute = route.slice(0, i)
          .concat(route.slice(i, j + 1).reverse())
          .concat(route.slice(j + 1));

        if (calculateRouteLength(newRoute) < calculateRouteLength(route) - 1e-9) {
          route = newRoute;
          improved = true;
        }
      }
    }
  }

  let totalDistance = calculateRouteLength(route);

  if (returnToStart) {
    totalDistance += getDistance(route[route.length - 1], canonStart);
    route.push(canonStart);
  }

  return {
    route: route,
    totalDistanceKm: parseFloat(totalDistance.toFixed(2)),
    trace: trace
  };
}

// Top-level Plan Trip function using Agent Memory
function planAgentTrip(requestedStops, start = null, returnToStart = false) {
  const canonStart = start ? resolveLocation(start) : (memory.currentLocation || "Phagwara");
  const canonGoals = requestedStops.map(s => resolveLocation(s)).filter(Boolean);

  // Memory: filter unvisited
  const todo = canonGoals.filter(s => !memory.visited.includes(s));
  const skipped = canonGoals.filter(s => memory.visited.includes(s));

  if (todo.length === 0) {
    return {
      start: canonStart,
      route: [canonStart],
      totalDistanceKm: 0.0,
      trace: [],
      skipped: skipped,
      note: "All requested stops were already visited earlier this session."
    };
  }

  const outcome = orderStops(canonStart, todo, returnToStart);

  // Update Memory
  todo.forEach(s => {
    if (!memory.visited.includes(s)) memory.visited.push(s);
  });
  memory.currentLocation = returnToStart ? canonStart : outcome.route[outcome.route.length - 1];
  memory.totalDistance += outcome.totalDistanceKm;

  return {
    start: canonStart,
    route: outcome.route,
    totalDistanceKm: outcome.totalDistanceKm,
    trace: outcome.trace,
    skipped: skipped
  };
}

// ---------------------------------------------------------------------------
// 4. Map & UI Renderers with OSRM Real Street Driving Routes
// ---------------------------------------------------------------------------
async function renderRouteOnMap(result) {
  // Clear old markers & polyline
  routeMarkers.forEach(m => map.removeLayer(m));
  routeMarkers = [];
  if (routePolyline) map.removeLayer(routePolyline);

  const route = result.route;
  if (!route || route.length === 0) return;

  const latLons = route.map(loc => [locationsDB[loc].lat, locationsDB[loc].lon]);

  // Draw custom pin markers
  route.forEach((loc, idx) => {
    const coords = [locationsDB[loc].lat, locationsDB[loc].lon];
    let iconHtml = '';
    let markerClass = '';

    if (idx === 0) {
      iconHtml = '<i class="fa-solid fa-rocket"></i>';
      markerClass = 'start-pin';
    } else if (idx === route.length - 1 && result.route[0] === loc) {
      iconHtml = '<i class="fa-solid fa-flag-checkered"></i>';
      markerClass = 'end-pin';
    } else {
      iconHtml = `<span>${idx}</span>`;
      markerClass = 'stop-pin';
    }

    const customIcon = L.divIcon({
      className: `custom-map-pin ${markerClass}`,
      html: `<div class="pin-inner">${iconHtml}</div><div class="pin-label">${loc}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });

    const marker = L.marker(coords, { icon: customIcon }).addTo(map);
    marker.bindPopup(`<strong>${loc}</strong><br>Stop #${idx === 0 ? 'Start' : idx}`);
    routeMarkers.push(marker);
  });

  // Try fetching actual street driving geometry from OSRM public API
  let streetPathCoordinates = [];
  try {
    const waypoints = route.map(loc => `${locationsDB[loc].lon},${locationsDB[loc].lat}`).join(';');
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const geojsonCoords = data.routes[0].geometry.coordinates;
      streetPathCoordinates = geojsonCoords.map(c => [c[1], c[0]]); // GeoJSON [lon, lat] -> Leaflet [lat, lon]
    }
  } catch (err) {
    console.warn("OSRM street routing API unavailable, falling back to direct line polylines:", err);
  }

  // Fallback to direct leg polylines if OSRM is unreachable
  const finalPolylineCoords = streetPathCoordinates.length > 0 ? streetPathCoordinates : latLons;

  // Draw Route Polyline along streets
  routePolyline = L.polyline(finalPolylineCoords, {
    color: '#0284c7',
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Fit bounds to show full trip
  map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });

  // Update Results Bar
  const resultsBar = document.getElementById('results-bar');
  const routeDisplay = document.getElementById('route-text-display');
  const distDisplay = document.getElementById('distance-display');
  const skippedWarning = document.getElementById('skipped-warning');
  const skippedText = document.getElementById('skipped-text');

  resultsBar.classList.remove('hidden');
  routeDisplay.innerText = route.join(" ➔ ");
  distDisplay.innerText = `${result.totalDistanceKm} km`;

  if (result.skipped && result.skipped.length > 0) {
    skippedWarning.style.display = 'block';
    skippedText.innerText = `Skipped Visited: ${result.skipped.join(', ')}`;
  } else {
    skippedWarning.style.display = 'none';
  }

  // Update Memory Panel
  updateMemoryUI(result);
}

function updateMemoryUI(latestResult) {
  document.getElementById('visited-count').innerText = memory.visited.length;
  document.getElementById('session-dist').innerText = `${memory.totalDistance.toFixed(1)} km`;
  document.getElementById('current-loc-display').innerText = memory.currentLocation || "None";

  // Visited Tags
  const visitedContainer = document.getElementById('visited-tags-list');
  if (memory.visited.length === 0) {
    visitedContainer.innerHTML = `<span class="empty-msg">No stops visited yet in this session.</span>`;
  } else {
    visitedContainer.innerHTML = memory.visited
      .map(v => `<span class="visited-tag"><i class="fa-solid fa-check"></i> ${v}</span>`)
      .join('');
  }

  // Trace Log
  const traceContainer = document.getElementById('trace-log-container');
  if (latestResult && latestResult.trace) {
    traceContainer.innerHTML = latestResult.trace.map(t => `
      <div class="trace-step">
        <div class="step-title">Step ${t.step}: at ${t.from}</div>
        <div class="step-decision">➔ ${t.decision}</div>
      </div>
    `).join('');
  }
}

// ---------------------------------------------------------------------------
// 5. User Event Handlers
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Start Input Suggestions
  const startInput = document.getElementById('start-input');
  const startSuggestions = document.getElementById('start-suggestions');

  startInput.addEventListener('input', (e) => {
    const matches = searchLocations(e.target.value);
    if (matches.length > 0) {
      startSuggestions.innerHTML = matches.map(m => `
        <div class="suggestion-item" data-val="${m}">
          <span>${m}</span>
          <span class="type-badge">${locationsDB[m].type || 'city'}</span>
        </div>
      `).join('');
      startSuggestions.style.display = 'block';
    } else {
      startSuggestions.style.display = 'none';
    }
  });

  startSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (item) {
      startInput.value = item.dataset.val;
      startLocation = item.dataset.val;
      startSuggestions.style.display = 'none';
    }
  });

  // Stop Search & Tag Add
  const stopInput = document.getElementById('stop-search-input');
  const stopSuggestions = document.getElementById('stop-suggestions');

  stopInput.addEventListener('input', (e) => {
    const matches = searchLocations(e.target.value);
    if (matches.length > 0) {
      stopSuggestions.innerHTML = matches.map(m => `
        <div class="suggestion-item" data-val="${m}">
          <span>${m}</span>
          <span class="type-badge">${locationsDB[m].type || 'city'}</span>
        </div>
      `).join('');
      stopSuggestions.style.display = 'block';
    } else {
      stopSuggestions.style.display = 'none';
    }
  });

  stopSuggestions.addEventListener('click', (e) => {
    const item = e.target.closest('.suggestion-item');
    if (item) {
      addStopTag(item.dataset.val);
      stopInput.value = '';
      stopSuggestions.style.display = 'none';
    }
  });

  // Quick Chips
  document.querySelectorAll('#quick-starts .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      startInput.value = chip.dataset.val;
      startLocation = chip.dataset.val;
    });
  });

  document.querySelectorAll('.chip-add').forEach(chip => {
    chip.addEventListener('click', () => {
      addStopTag(chip.dataset.val);
    });
  });

  // Plan Button
  document.getElementById('plan-btn').addEventListener('click', () => {
    if (selectedStops.length === 0) {
      alert("Please select at least 1 destination stop!");
      return;
    }

    const startVal = startInput.value.trim() || memory.currentLocation || "Phagwara";
    const returnToStart = document.getElementById('return-start-check').checked;

    const result = planAgentTrip(selectedStops, startVal, returnToStart);
    renderRouteOnMap(result);
  });

  // Reset Memory Button
  document.getElementById('reset-memory-btn').addEventListener('click', () => {
    memory.visited = [];
    memory.currentLocation = "Phagwara";
    memory.distanceCache = {};
    memory.totalDistance = 0.0;
    updateMemoryUI(null);
  });

  // Gemini API Key Modal
  const apiKeyBtn = document.getElementById('api-key-btn');
  const apiModal = document.getElementById('api-modal');
  const closeModal = document.querySelector('.close-modal');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const removeKeyBtn = document.getElementById('remove-key-btn');

  apiKeyBtn.addEventListener('click', () => apiModal.classList.add('active'));
  closeModal.addEventListener('click', () => apiModal.classList.remove('active'));
  saveKeyBtn.addEventListener('click', () => {
    const key = document.getElementById('gemini-key-input').value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      localStorage.setItem('gemini_model', document.getElementById('gemini-model-select').value);
      alert("Gemini API key saved!");
      apiModal.classList.remove('active');
    }
  });
  removeKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('gemini_api_key');
    document.getElementById('gemini-key-input').value = '';
    alert("Gemini API key removed.");
  });

  // Gemini Chat Send
  document.getElementById('send-chat-btn').addEventListener('click', handleSendChat);
  document.getElementById('parse-route-btn').addEventListener('click', handleParseRouteFromChat);

  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendChat();
      }
    });
  }
}

function addStopTag(name) {
  const canon = resolveLocation(name);
  if (!canon) return;
  if (!selectedStops.includes(canon)) {
    selectedStops.push(canon);
    renderSelectedStops();
  }
}

function removeStopTag(name) {
  selectedStops = selectedStops.filter(s => s !== name);
  renderSelectedStops();
}

function renderSelectedStops() {
  const container = document.getElementById('selected-stops-list');
  container.innerHTML = selectedStops.map(s => `
    <span class="stop-tag">
      ${s} <i class="fa-solid fa-xmark remove-tag" onclick="removeStopTag('${s}')"></i>
    </span>
  `).join('');
}

function switchTab(tabName) {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const targetContent = document.getElementById(`tab-${tabName}`);

  if (targetBtn) targetBtn.classList.add('active');
  if (targetContent) targetContent.classList.add('active');
}
window.switchTab = switchTab;

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab) {
        switchTab(tab.dataset.tab);
      }
    });
  });
}

// Active API Key Configuration
function getActiveApiKey() {
  const saved = localStorage.getItem('gemini_api_key');
  return (saved && saved.trim()) ? saved.trim() : (window.GEMINI_API_KEY || "");
}

function loadApiKey() {
  const saved = localStorage.getItem('gemini_api_key');
  const inputEl = document.getElementById('gemini-key-input');
  if (saved && inputEl) {
    inputEl.value = saved;
  }
}

// ---------------------------------------------------------------------------
// 6. Gemini Flash API Integration (Official systemInstruction + Dynamic Multi-Turn Chat)
// ---------------------------------------------------------------------------
// Expose functions globally
window.handleSendChat = handleSendChat;
window.handleParseRouteFromChat = handleParseRouteFromChat;

// ---------------------------------------------------------------------------
// 6. Gemini Flash API Integration (Official systemInstruction + Dynamic Multi-Turn Chat)
// ---------------------------------------------------------------------------
let geminiChatHistory = [];

async function handleSendChat() {
  const inputEl = document.getElementById('chat-input');
  const query = inputEl.value.trim();
  if (!query) return;

  // Render User Message
  appendChatMessage(escapeHtml(query), 'user');
  inputEl.value = '';

  const apiKey = getActiveApiKey();

  // Append user turn to conversation history
  geminiChatHistory.push({
    role: "user",
    parts: [{ text: query }]
  });

  // Render Loading indicator
  const loadingId = 'loading-' + Date.now();
  appendChatMessage(`<i class="fa-solid fa-spinner fa-spin"></i> Gemini Flash thinking...`, 'bot', loadingId);

  let success = false;
  let responseText = "";
  let lastErrorMessage = "";

  const payload = {
    systemInstruction: {
      parts: [
        {
          text: "You are an intelligent, friendly Punjab travel assistant for a Multi-Stop Route Planner app. Answer each user question specifically, concisely, dynamically, and uniquely based on what the user asks (e.g. food recommendations, tourist places, travel time, route advice). Do NOT repeat generic introductory text or lists unless asked."
        }
      ]
    },
    contents: geminiChatHistory,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1000
    }
  };

  const userApiKey = getActiveApiKey();
  
  // Collect candidate key/auth strategies to guarantee connectivity
  const keysToTry = [
    { key: userApiKey, isBearer: userApiKey.startsWith("AQ.") },
    { key: userApiKey, isBearer: false }
  ];

  const modelsToTry = ['gemini-1.5-flash', 'gemini-3.5-flash', 'gemini-2.0-flash'];

  for (const strat of keysToTry) {
    if (!strat.key) continue;
    for (const model of modelsToTry) {
      try {
        const url = strat.isBearer 
          ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
          : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${strat.key}`;

        const headers = { 'Content-Type': 'application/json' };
        if (strat.isBearer) {
          headers['Authorization'] = `Bearer ${strat.key}`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
          responseText = data.candidates[0].content.parts[0].text;
          success = true;
          break;
        } else if (data.error && data.error.message) {
          lastErrorMessage = data.error.message;
        }
      } catch (err) {
        lastErrorMessage = err.message;
      }
    }
    if (success) break;
  }

  const loadingEl = document.getElementById(loadingId);
  if (success && responseText) {
    // Append Model turn to chat history for multi-turn context
    geminiChatHistory.push({
      role: "model",
      parts: [{ text: responseText }]
    });

    let htmlFormatted = formatMarkdownToHtml(responseText);
    
    // Check if response contains route recommendations and append interactive action button
    const extracted = smartExtractStops(responseText);
    if (extracted.stops && extracted.stops.length > 0) {
      htmlFormatted += `<div style="margin-top: 10px;">
        <button class="ai-action-btn" onclick="handleParseRouteFromChat()" style="background: linear-gradient(135deg, var(--primary-blue), var(--primary-indigo)); color: #fff; padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600;">
          <i class="fa-solid fa-route"></i> Plot Gemini's Route on Map
        </button>
      </div>`;
    }

    if (loadingEl) {
      loadingEl.innerHTML = htmlFormatted;
    } else {
      appendChatMessage(htmlFormatted, 'bot');
    }
  } else {
    if (loadingEl) loadingEl.innerHTML = `<span style="color:#ef4444;">Gemini API Error: ${lastErrorMessage || 'Unable to connect to Gemini API.'}</span>`;
    geminiChatHistory.pop(); // Remove unfulfilled turn
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

function formatMarkdownToHtml(text) {
  let html = escapeHtml(text);
  
  // Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Bullet lists (- or *)
  html = html.replace(/^\s*[\-\*]\s+(.*)$/gim, '• $1<br>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

function handleParseRouteFromChat(customText = null) {
  let text = customText;
  if (!text) {
    const lastUserMsgEl = document.querySelector('.chat-message.user:last-of-type');
    const lastBotMsgEl = document.querySelector('.chat-message.bot:last-of-type');
    text = (lastUserMsgEl ? lastUserMsgEl.innerText : "") + " " + (lastBotMsgEl ? lastBotMsgEl.innerText : "");
  }

  const parsed = smartExtractStops(text);
  
  if (parsed.start) {
    const startInput = document.getElementById('start-input');
    if (startInput) startInput.value = parsed.start;
    startLocation = parsed.start;
  }

  if (parsed.stops && parsed.stops.length > 0) {
    selectedStops = [];
    parsed.stops.forEach(s => {
      if (!selectedStops.includes(s)) selectedStops.push(s);
    });
    renderSelectedStops();

    // Automatically plan route & plot on map
    const returnToStart = document.getElementById('return-start-check') ? document.getElementById('return-start-check').checked : false;
    const result = planAgentTrip(selectedStops, startLocation, returnToStart);
    renderRouteOnMap(result);
  }

  // Switch to planner tab to show results
  switchTab('planner');
}

function smartExtractStops(text) {
  if (!text) return { start: "Phagwara", stops: [] };

  const textLower = text.toLowerCase();
  let foundLocations = [];

  // 1. Landmark Aliases (e.g. golden temple -> Amritsar, lpu -> Phagwara)
  Object.keys(ALIASES).forEach(alias => {
    if (textLower.includes(alias)) {
      const canon = ALIASES[alias];
      if (locationsDB[canon] && !foundLocations.includes(canon)) {
        foundLocations.push(canon);
      }
    }
  });

  // 2. Scan location names in dataset (longest matches first)
  const sortedKeys = locationKeys.slice().sort((a, b) => b.length - a.length);
  sortedKeys.forEach(name => {
    const nameLower = name.toLowerCase();
    if (name.length >= 4 && textLower.includes(nameLower)) {
      if (!foundLocations.includes(name)) {
        foundLocations.push(name);
      }
    }
  });

  // 3. Fallback token resolution if no long names found
  if (foundLocations.length === 0) {
    const tokens = text.split(/[\s,;.!?]+/);
    tokens.forEach(tok => {
      const canon = resolveLocation(tok);
      if (canon && !foundLocations.includes(canon)) {
        foundLocations.push(canon);
      }
    });
  }

  // 4. Extract explicit starting location ("starting from X", "from X")
  let startLoc = null;
  const startPatterns = [
    /start(?:ing)?\s+(?:from|at)\s+([A-Za-z\s]+?)(?:\s+visit|\s+to|,|\.|$)/i,
    /from\s+([A-Za-z\s]+?)(?:\s+to|\s+visit|,|\.|$)/i
  ];

  for (const pat of startPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const resolved = resolveLocation(match[1].trim());
      if (resolved) {
        startLoc = resolved;
        break;
      }
    }
  }

  if (!startLoc && foundLocations.length > 0) {
    startLoc = foundLocations[0];
  }
  if (!startLoc) {
    startLoc = memory.currentLocation || "Phagwara";
  }

  const stops = foundLocations.filter(loc => loc !== startLoc);
  return {
    start: startLoc,
    stops: stops.length > 0 ? stops : foundLocations
  };
}

function appendChatMessage(msg, type, msgId = null) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-message ${type}`;
  if (msgId) div.id = msgId;
  div.innerHTML = msg;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
