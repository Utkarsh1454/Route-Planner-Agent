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
  "lpu": "LPU Campus",
  "lpu campus": "LPU Campus",
  "lovely professional university": "LPU Campus",
  "eastwood": "Eastwood Village",
  "eastwood village": "Eastwood Village",
  "eastwood mall": "Eastwood Mall",
  "eastwood village mall": "Eastwood Mall",
  "attari border": "Amritsar",
  "wagah border": "Amritsar",
  "jallianwala bagh": "Amritsar",
  "durgiana mandir": "Amritsar",
  "sukhna lake": "Sukhna Lake",
  "elgin cafe": "Elgin Cafe",
  "bistro flamme bois": "Bistro Flamme Bois",
  "virgin courtyard": "Virgin Courtyard",
  "the back room": "The Back Room",
  "rangla punjab": "Rangla Punjab",
  "rangla punjab haveli": "Rangla Punjab",
  "haveli rangla punjab": "Rangla Punjab"
};

// Initialize Application
function initApp() {
  loadMemoryFromLocalStorage();
  initMap();
  loadLocations();
  setupEventListeners();
  setupTabs();
  loadApiKey();
  updateMemoryUI(null);
}

function saveMemoryToLocalStorage() {
  try {
    localStorage.setItem('punjab_agent_memory', JSON.stringify({
      visited: memory.visited,
      currentLocation: memory.currentLocation,
      distanceCache: memory.distanceCache,
      tripLog: memory.tripLog,
      totalDistance: memory.totalDistance
    }));
  } catch (e) {
    console.warn("Unable to save memory to localStorage:", e);
  }
}

function loadMemoryFromLocalStorage() {
  try {
    const saved = localStorage.getItem('punjab_agent_memory');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.visited)) memory.visited = parsed.visited;
      if (parsed.currentLocation) memory.currentLocation = parsed.currentLocation;
      if (parsed.distanceCache) memory.distanceCache = parsed.distanceCache;
      if (parsed.tripLog) memory.tripLog = parsed.tripLog;
      if (typeof parsed.totalDistance === 'number') memory.totalDistance = parsed.totalDistance;
    }
  } catch (e) {
    console.warn("Unable to load memory from localStorage:", e);
  }
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

  // Layer 1: OpenStreetMap Standard Map (Free, High Availability)
  const streetTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  });

  // Layer 2: Esri World Street Map
  const esriStreetTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS',
    maxZoom: 18
  });

  // Layer 3: Esri Dark Gray Canvas Map
  const darkTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  });

  // Layer 4: Esri World Topo Map
  const topoTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 18
  });

  // Add street tiles as default map
  streetTiles.addTo(map);

  // Layer Switcher Control (Top Right)
  const baseMaps = {
    "🗺️ OpenStreetMap": streetTiles,
    "🛣️ Esri World Streets": esriStreetTiles,
    "🌙 Dark Canvas (Esri)": darkTiles,
    "🏔️ Topo Terrain (Esri)": topoTiles
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

const GENERIC_CHAINS = new Set([
  "mcdonald's", "mcdonalds", "subway", "starbucks", "kfc", "domino's", "dominos", "burger king", "pizza hut"
]);

function resolveLocation(name, contextStart = null) {
  if (!name) return null;
  const clean = name.trim();
  const lower = clean.toLowerCase();

  // 1. Landmark Aliases (e.g. golden temple -> Amritsar, lpu -> Phagwara, eastwood -> Eastwood Village)
  if (ALIASES[lower] && locationsDB[ALIASES[lower]]) {
    return ALIASES[lower];
  }

  // 2. Generic Brand Chain contextual branch matching
  const currentStart = contextStart || startLocation || memory.currentLocation;
  if (GENERIC_CHAINS.has(lower) && currentStart) {
    const startClean = currentStart.trim();
    const candidate = `${clean} ${startClean}`;
    if (locationsDB[candidate]) return candidate;
    if (locationLookup[candidate.toLowerCase()]) return locationLookup[candidate.toLowerCase()];
  }

  // 3. Exact Key Match in Database
  if (locationsDB[clean]) return clean;
  if (locationLookup[lower]) return locationLookup[lower];

  const GENERIC_EXCLUDE = new Set([
    "market", "store", "chowk", "main", "mandi", "dhar", "jalan", "mode", "rama", 
    "town", "stand", "bus stand", "city", "post", "office", "street", "road", "near",
    "hospital", "gate", "block", "station", "supermarket", "school", "college", "sector",
    "punjab", "india", "pakistan", "state", "country", "district", "region", "province", "area",
    "lake", "park", "cafe", "restaurant", "bistro", "bar", "room", "hotel", "mall", "court", "center", "view", "spot", "place",
    "alike", "simply", "head", "direct", "just", "drive", "highway", "cab", "auto", "route", "best", "vibrant", "popular", "students", "visitors"
  ]);

  // Exact word boundary match on dataset keys
  const regBoundary = new RegExp('\\b' + lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');

  // Substring match: filter out generic standalone keys unless exact query match
  const subMatches = locationKeys.filter(k => {
    const kLower = k.toLowerCase();
    if (GENERIC_EXCLUDE.has(kLower) && kLower !== lower) return false;
    return kLower.includes(lower);
  });

  if (subMatches.length > 0) {
    subMatches.sort((a, b) => a.length - b.length);
    return subMatches[0];
  }

  // Reverse substring match with word boundary check
  const revMatches = locationKeys.filter(k => {
    const kLower = k.toLowerCase();
    if (kLower.length <= 3) return false;
    if (GENERIC_EXCLUDE.has(kLower)) return false;
    const reg = new RegExp('\\b' + kLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return reg.test(lower);
  });

  if (revMatches.length > 0) {
    revMatches.sort((a, b) => b.length - a.length);
    return revMatches[0];
  }

  return null;
}

function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];
  const qLower = query.toLowerCase().trim();
  const tokens = qLower.split(/\s+/).filter(t => t.length > 1);

  const exact = [];
  const prefix = [];
  const allTokens = [];
  const substring = [];

  for (let i = 0; i < locationKeys.length; i++) {
    const k = locationKeys[i];
    const kLower = k.toLowerCase();

    if (kLower === qLower) {
      exact.push(k);
    } else if (kLower.startsWith(qLower)) {
      prefix.push(k);
    } else if (tokens.length > 1 && tokens.every(t => kLower.includes(t))) {
      allTokens.push(k);
    } else if (kLower.includes(qLower)) {
      substring.push(k);
    }
  }

  const combined = [];
  const addItems = (arr) => {
    for (let j = 0; j < arr.length; j++) {
      if (!combined.includes(arr[j])) combined.push(arr[j]);
    }
  };

  addItems(exact);
  addItems(prefix);
  addItems(allTokens);
  addItems(substring);

  return combined.slice(0, 25);
}

// ---------------------------------------------------------------------------
// 3. Routing Engine (Haversine + 2-Opt Optimizer matching agent.py)
// Note: This client-side JavaScript 2-Opt Routing Engine is an intentional standalone
// frontend mirror of agent.py's order_stops tool for immediate browser rendering.
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
function planAgentTrip(requestedStops, start = null, returnToStart = false, ignoreMemory = false) {
  const canonStart = start ? resolveLocation(start) : (memory.currentLocation || "Phagwara");
  const canonGoals = requestedStops.map(s => resolveLocation(s, canonStart)).filter(Boolean);

  let todo = canonGoals;
  let skipped = [];

  if (!ignoreMemory) {
    todo = canonGoals.filter(s => !memory.visited.includes(s));
    skipped = canonGoals.filter(s => memory.visited.includes(s));
  }

  // If ALL requested stops were already visited, automatically re-visit so UI planning never fails with 0km
  let autoRevisited = false;
  if (todo.length === 0 && canonGoals.length > 0) {
    todo = canonGoals;
    skipped = [];
    autoRevisited = true;
  }

  const outcome = orderStops(canonStart, todo, returnToStart);

  // Update Memory
  todo.forEach(s => {
    if (!memory.visited.includes(s)) memory.visited.push(s);
  });
  memory.currentLocation = returnToStart ? canonStart : outcome.route[outcome.route.length - 1];
  
  if (!autoRevisited) {
    memory.totalDistance += outcome.totalDistanceKm;
  }

  return {
    start: canonStart,
    route: outcome.route,
    totalDistanceKm: outcome.totalDistanceKm,
    trace: outcome.trace,
    skipped: skipped,
    autoRevisited: autoRevisited
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

  if (routePolyline) map.removeLayer(routePolyline);
  if (window.routePolylineGlow) map.removeLayer(window.routePolylineGlow);

  // Fallback to direct leg polylines if OSRM is unreachable
  const finalPolylineCoords = streetPathCoordinates.length > 0 ? streetPathCoordinates : latLons;

  // Outer Neon Glow Polyline
  window.routePolylineGlow = L.polyline(finalPolylineCoords, {
    color: '#38bdf8',
    weight: 10,
    opacity: 0.35,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Core Driving Route Polyline
  routePolyline = L.polyline(finalPolylineCoords, {
    color: '#6366f1',
    weight: 5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // Fit bounds to show full trip
  map.fitBounds(routePolyline.getBounds(), { padding: [60, 60] });

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
    skippedText.innerHTML = `Skipped Visited: ${result.skipped.join(', ')} <button id="replan-clear-btn" style="margin-left: 6px; background: #f59e0b; color: #000; border: none; padding: 2px 8px; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 10px;"><i class="fa-solid fa-rotate-left"></i> Re-visit / Clear Memory</button>`;
    
    setTimeout(() => {
      const btn = document.getElementById('replan-clear-btn');
      if (btn) {
        btn.onclick = () => {
          memory.visited = memory.visited.filter(v => !result.skipped.includes(v));
          updateMemoryUI(null);
          const startVal = document.getElementById('start-input').value.trim() || memory.currentLocation || "Phagwara";
          const returnToStart = document.getElementById('return-start-check') ? document.getElementById('return-start-check').checked : false;
          const newResult = planAgentTrip(selectedStops, startVal, returnToStart, true);
          renderRouteOnMap(newResult);
        };
      }
    }, 50);
  } else {
    skippedWarning.style.display = 'none';
  }

  // Update Memory Panel
  updateMemoryUI(result);
}

function updateMemoryUI(latestResult) {
  saveMemoryToLocalStorage();
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
// 5. Address Helper & Search Renderers
// ---------------------------------------------------------------------------
const MAJOR_REGIONS = {
  'Amritsar': { lat: 31.635666, lon: 74.87875 },
  'Ludhiana': { lat: 30.909016, lon: 75.851601 },
  'Jalandhar': { lat: 31.332376, lon: 75.576889 },
  'Patiala': { lat: 30.330199, lon: 76.400766 },
  'Mohali': { lat: 30.69088, lon: 76.711488 },
  'Bathinda': { lat: 30.206791, lon: 74.94637 },
  'Pathankot': { lat: 32.2746, lon: 75.6529 },
  'Hoshiarpur': { lat: 31.5295, lon: 75.9103 },
  'Moga': { lat: 30.822341, lon: 75.173097 },
  'Phagwara': { lat: 31.220673, lon: 75.769646 },
  'Rupnagar': { lat: 30.968837, lon: 76.526088 },
  'Firozpur': { lat: 30.9237, lon: 74.6119 },
  'Kapurthala': { lat: 31.38, lon: 75.38 },
  'Sangrur': { lat: 30.2458, lon: 75.8423 },
  'Faridkot': { lat: 30.6769, lon: 74.7577 },
  'Gurdaspur': { lat: 32.0419, lon: 75.4053 },
  'Fatehgarh Sahib': { lat: 30.6482, lon: 76.3986 },
  'Tarn Taran': { lat: 31.4518, lon: 74.9269 },
  'Barnala': { lat: 30.3819, lon: 75.5469 },
  'Mansa': { lat: 29.9882, lon: 75.3856 },
  'Fazilka': { lat: 30.4036, lon: 74.0267 },
  'Muktsar': { lat: 30.4754, lon: 74.5165 }
};

function getNearestRegion(lat, lon) {
  if (!lat || !lon) return "Punjab";
  let minD = Infinity;
  let bestRegion = "Punjab";
  for (const [region, coords] of Object.entries(MAJOR_REGIONS)) {
    const d = Math.hypot(lat - coords.lat, lon - coords.lon);
    if (d < minD) {
      minD = d;
      bestRegion = region;
    }
  }
  return bestRegion;
}

function getLocationMeta(name) {
  const loc = locationsDB[name] || {};
  const rawType = (loc.type || 'city').toLowerCase();

  let icon = 'fa-solid fa-location-dot';
  let badgeClass = 'type-city';
  let label = 'City / Town';

  if (rawType.includes('city') || rawType.includes('town')) {
    icon = 'fa-solid fa-city';
    badgeClass = 'type-city';
    label = 'City / Town';
  } else if (rawType.includes('university') || rawType.includes('college') || rawType.includes('school')) {
    icon = 'fa-solid fa-graduation-cap';
    badgeClass = 'type-edu';
    label = 'School / Edu';
  } else if (rawType.includes('market') || rawType.includes('supermarket') || rawType.includes('mall') || rawType.includes('shop')) {
    icon = 'fa-solid fa-bag-shopping';
    badgeClass = 'type-shop';
    label = 'Marketplace';
  } else if (rawType.includes('restaurant') || rawType.includes('cafe') || rawType.includes('food') || rawType.includes('fast_food')) {
    icon = 'fa-solid fa-utensils';
    badgeClass = 'type-food';
    label = 'Restaurant / Dining';
  } else if (rawType.includes('hospital') || rawType.includes('clinic') || rawType.includes('pharmacy')) {
    icon = 'fa-solid fa-hospital';
    badgeClass = 'type-health';
    label = 'Hospital / Medical';
  } else if (rawType.includes('bus') || rawType.includes('station') || rawType.includes('transit')) {
    icon = 'fa-solid fa-bus';
    badgeClass = 'type-transit';
    label = 'Transit Terminal';
  } else if (rawType.includes('hotel') || rawType.includes('guest') || rawType.includes('lodging')) {
    icon = 'fa-solid fa-hotel';
    badgeClass = 'type-hotel';
    label = 'Hotel / Lodging';
  } else if (rawType.includes('worship') || rawType.includes('temple') || rawType.includes('gurdwara')) {
    icon = 'fa-solid fa-gopuram';
    badgeClass = 'type-worship';
    label = 'Place of Worship';
  } else if (rawType.includes('police')) {
    icon = 'fa-solid fa-shield-halved';
    badgeClass = 'type-police';
    label = 'Police Station';
  } else if (rawType.includes('suburb') || rawType.includes('village') || rawType.includes('residential')) {
    icon = 'fa-solid fa-house-chimney';
    badgeClass = 'type-village';
    label = 'Area / Village';
  }

  const region = getNearestRegion(loc.lat, loc.lon);
  const addressText = (name.toLowerCase() === region.toLowerCase())
    ? `Major District, Punjab • GPS: ${loc.lat ? loc.lat.toFixed(2) : 0}°N, ${loc.lon ? loc.lon.toFixed(2) : 0}°E`
    : `Near ${region} Region, Punjab • GPS: ${loc.lat ? loc.lat.toFixed(2) : 0}°N, ${loc.lon ? loc.lon.toFixed(2) : 0}°E`;

  return { icon, badgeClass, label, addressText };
}

function renderSuggestionItemHtml(name) {
  const meta = getLocationMeta(name);
  return `
    <div class="suggestion-item" data-val="${name}">
      <div class="suggestion-main">
        <i class="${meta.icon} suggestion-icon"></i>
        <div class="suggestion-text">
          <div class="suggestion-name">${name}</div>
          <div class="suggestion-address"><i class="fa-solid fa-map-pin" style="font-size:9px; opacity:0.7;"></i> ${meta.addressText}</div>
        </div>
      </div>
      <span class="type-badge ${meta.badgeClass}">${meta.label}</span>
    </div>
  `;
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
      startSuggestions.innerHTML = matches.map(m => renderSuggestionItemHtml(m)).join('');
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
      stopSuggestions.innerHTML = matches.map(m => renderSuggestionItemHtml(m)).join('');
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
    const ignoreMemory = document.getElementById('ignore-memory-check') ? document.getElementById('ignore-memory-check').checked : false;

    const result = planAgentTrip(selectedStops, startVal, returnToStart, ignoreMemory);
    renderRouteOnMap(result);
  });

  // Reset & Clear Memory Action Helper
  const clearMemoryAction = () => {
    memory.visited = [];
    memory.currentLocation = "Phagwara";
    memory.distanceCache = {};
    memory.tripLog = [];
    memory.totalDistance = 0.0;
    localStorage.removeItem('punjab_agent_memory');
    updateMemoryUI(null);
  };

  const resetBtn = document.getElementById('reset-memory-btn');
  if (resetBtn) resetBtn.addEventListener('click', clearMemoryAction);

  const clearBtn = document.getElementById('clear-memory-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearMemoryAction);

  const headerClearBtn = document.getElementById('header-clear-memory-btn');
  if (headerClearBtn) headerClearBtn.addEventListener('click', clearMemoryAction);

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

  if (map) {
    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }
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
  loadAvailableModelsFromApi();
}

async function loadAvailableModelsFromApi() {
  const apiKey = getActiveApiKey();
  const selectEl = document.getElementById('gemini-model-select');
  const btnEl = document.getElementById('list-models-btn');
  if (!selectEl) return;

  if (!apiKey) {
    statusLabel.innerHTML = `🔑 API Key missing - please configure in modal`;
    return;
  }

  if (btnEl) btnEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Fetching...`;

  try {
    const url = apiKey.startsWith("AQ.")
      ? `https://generativelanguage.googleapis.com/v1beta/models`
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

    const headers = {};
    if (apiKey.startsWith("AQ.")) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });
    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      const validModels = data.models.filter(m => 
        m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
      );

      if (validModels.length > 0) {
        const saved = localStorage.getItem('gemini_model') || 'gemini-2.5-flash';
        selectEl.innerHTML = validModels.map(m => {
          const modelId = m.name.replace('models/', '');
          const isSelected = (saved === modelId) ? 'selected' : '';
          const icon = modelId.includes('flash') ? '⚡' : '🧠';
          const label = m.displayName || modelId;
          return `<option value="${modelId}" ${isSelected}>${icon} ${label} (${modelId})</option>`;
        }).join('');

        const statusLabelEl = document.getElementById('modal-quota-badge');
        if (statusLabelEl) {
          statusLabelEl.textContent = `🟢 ${validModels.length} Models Active (ListModels)`;
        }
      }
    }
  } catch (err) {
    console.warn("ListModels API call note:", err);
  } finally {
    if (btnEl) btnEl.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> ListModels (Fetch Active)`;
  }
}

// Expose functions globally
window.handleSendChat = handleSendChat;
window.handleParseRouteFromChat = handleParseRouteFromChat;
window.loadAvailableModelsFromApi = loadAvailableModelsFromApi;

// ---------------------------------------------------------------------------
// 6. Gemini Flash API Integration (Official systemInstruction + Dynamic Multi-Turn Chat)
// ---------------------------------------------------------------------------
let geminiChatHistory = [];
const quotaState = {
  totalRequests: 0,
  successfulRequests: 0,
  rateLimitErrors: 0,
  cooldownUntil: 0
};
let quotaTimer = null;

function updateQuotaMonitorUI() {
  const reqEl1 = document.getElementById('tab-quota-requests');
  const reqEl2 = document.getElementById('modal-quota-requests');
  const succEl1 = document.getElementById('tab-quota-success');
  const succEl2 = document.getElementById('modal-quota-success');
  const badgeEl1 = document.getElementById('tab-quota-badge');
  const badgeEl2 = document.getElementById('modal-quota-badge');

  const total = quotaState.totalRequests;
  const succ = quotaState.successfulRequests;
  const ratePct = total > 0 ? Math.round((succ / total) * 100) : 100;

  if (reqEl1) reqEl1.textContent = total;
  if (reqEl2) reqEl2.textContent = total;
  if (succEl1) succEl1.textContent = `${ratePct}%`;
  if (succEl2) succEl2.textContent = `${ratePct}%`;

  const now = Date.now();
  let badgeText = "🟢 Free Tier Active";
  let badgeClass = "status-ok";

  if (quotaState.cooldownUntil > now) {
    const remSec = Math.ceil((quotaState.cooldownUntil - now) / 1000);
    badgeText = `⏳ Cooldown (${remSec}s)`;
    badgeClass = "status-warning";
  } else if (!getActiveApiKey()) {
    badgeText = "🔴 Key Required";
    badgeClass = "status-error";
  }

  [badgeEl1, badgeEl2].forEach(b => {
    if (b) {
      b.textContent = badgeText;
      b.className = `quota-badge ${badgeClass}`;
    }
  });
}

function triggerRateLimitCooldown(seconds = 60) {
  quotaState.cooldownUntil = Date.now() + (seconds * 1000);
  updateQuotaMonitorUI();
  if (quotaTimer) clearInterval(quotaTimer);
  quotaTimer = setInterval(() => {
    updateQuotaMonitorUI();
    if (Date.now() >= quotaState.cooldownUntil) {
      clearInterval(quotaTimer);
    }
  }, 1000);
}

async function handleSendChat() {
  const inputEl = document.getElementById('chat-input');
  const query = inputEl.value.trim();
  if (!query) return;

  // Render User Message
  appendChatMessage(escapeHtml(query), 'user');
  inputEl.value = '';

  let userApiKey = getActiveApiKey();

  if (!userApiKey) {
    appendChatMessage(`🔑 <strong>Gemini API Key Required:</strong> Please click <button onclick="document.getElementById('api-modal').classList.add('active')" style="background:linear-gradient(135deg, var(--primary-blue), var(--primary-indigo)); color:#fff; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-weight:600;"><i class="fa-solid fa-key"></i> Configure API Key</button> to enter your Google AI Studio key.`, 'bot');
    updateQuotaMonitorUI();
    return;
  }

  // Check active cooldown
  if (quotaState.cooldownUntil > Date.now()) {
    const remSec = Math.ceil((quotaState.cooldownUntil - Date.now()) / 1000);
    appendChatMessage(`⏳ <strong>Rate Limit Cooldown Active:</strong> Free tier rate limit exceeded. Please wait <strong>${remSec}s</strong> before sending another prompt. Track your limit at <a href="https://ai.dev/rate-limit" target="_blank" style="color:var(--primary-blue);">ai.dev/rate-limit</a>.`, 'bot');
    return;
  }

  // Append user turn to conversation history
  geminiChatHistory.push({
    role: "user",
    parts: [{ text: query }]
  });

  const loadingId = 'loading-' + Date.now();
  appendChatMessage(`<i class="fa-solid fa-spinner fa-spin"></i> Consulting Gemini Flash AI & OpenStreetMap DB...`, 'bot', loadingId);

  let success = false;
  let responseText = "";
  let lastErrorMessage = "";

  quotaState.totalRequests += 1;
  updateQuotaMonitorUI();

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

  const keysToTry = [
    { key: userApiKey, isBearer: userApiKey.startsWith("AQ.") },
    { key: userApiKey, isBearer: false }
  ];

  let userSelectedModel = localStorage.getItem('gemini_model') || 'gemini-3.5-flash';
  if (userSelectedModel.includes('pro') || userSelectedModel === 'gemini-1.5-flash') {
    userSelectedModel = 'gemini-3.5-flash';
    localStorage.setItem('gemini_model', 'gemini-3.5-flash');
  }

  // Active models: prioritize Gemini 3.5 Flash and 3.7 Flash which have active 7/20 & 3/20 RPD quota
  const modelsToTry = [userSelectedModel, 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.6-flash', 'gemini-1.5-flash-latest']
    .filter(m => m && !m.includes('pro'))
    .filter((v, i, a) => a.indexOf(v) === i);

  for (const strat of keysToTry) {
    if (!strat.key) continue;
    for (const model of modelsToTry) {
      try {
        const url = strat.isBearer 
          ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
          : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(strat.key)}`;

        const headers = {
          'Content-Type': 'application/json'
        };

        if (strat.isBearer) {
          headers['Authorization'] = `Bearer ${strat.key}`;
        } else {
          headers['x-goog-api-key'] = strat.key;
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
          quotaState.successfulRequests += 1;
          updateQuotaMonitorUI();
          break;
        } else if (data.error && data.error.message) {
          lastErrorMessage = data.error.message;
          if (response.status === 429 || lastErrorMessage.toLowerCase().includes('quota') || lastErrorMessage.toLowerCase().includes('rate')) {
            quotaState.rateLimitErrors += 1;
            const matchSec = lastErrorMessage.match(/retry in\s+([\d.]+)\s*s/i);
            const retrySec = matchSec ? Math.ceil(parseFloat(matchSec[1])) : 60;
            triggerRateLimitCooldown(retrySec);
          }
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
  if (!text) return { start: memory.currentLocation || "Phagwara", stops: [] };

  const textLower = text.toLowerCase();
  let matchedSpans = []; // array of [startIdx, endIdx]
  let foundLocations = [];

  const GENERIC_EXCLUDE = new Set([
    "market", "store", "chowk", "main", "mandi", "dhar", "jalan", "mode", "rama", 
    "town", "stand", "bus stand", "city", "post", "office", "street", "road", "near",
    "hospital", "gate", "block", "station", "supermarket", "school", "college", "sector",
    "punjab", "india", "pakistan", "state", "country", "district", "region", "province", "area",
    "lake", "park", "cafe", "restaurant", "bistro", "bar", "room", "hotel", "mall", "court", "center", "view", "spot", "place",
    "alike", "simply", "head", "direct", "just", "drive", "highway", "cab", "auto", "route", "best", "vibrant", "popular", "students", "visitors"
  ]);

  const overlaps = (start, end) => {
    return matchedSpans.some(([s, e]) => (start < e && end > s));
  };

  const escapeReg = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 1. Landmark Aliases (e.g. golden temple -> Amritsar, lpu -> Phagwara)
  Object.keys(ALIASES).forEach(alias => {
    const canon = ALIASES[alias];
    if (!locationsDB[canon]) return;
    const reg = new RegExp('\\b' + escapeReg(alias) + '\\b', 'gi');
    let match;
    while ((match = reg.exec(textLower)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (!overlaps(start, end)) {
        if (!foundLocations.includes(canon)) foundLocations.push(canon);
        matchedSpans.push([start, end]);
      }
    }
  });

  // 2. Scan location names in dataset (longest matches first)
  const sortedKeys = locationKeys.slice().sort((a, b) => b.length - a.length);
  sortedKeys.forEach(name => {
    const nameLower = name.toLowerCase();
    if (name.length < 3) return;
    if (GENERIC_EXCLUDE.has(nameLower)) return;

    const reg = new RegExp('\\b' + escapeReg(nameLower) + '\\b', 'gi');
    let match;
    while ((match = reg.exec(textLower)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (!overlaps(start, end)) {
        if (!foundLocations.includes(name)) foundLocations.push(name);
        matchedSpans.push([start, end]);
      }
    }
  });

  // 3. Extract explicit starting location ("starting from X", "from X")
  let startLoc = null;
  const startPatterns = [
    /start(?:ing)?\s+(?:from|at)\s+([A-Za-z\s]+?)(?:\s+visit|\s+to|,|\.|$)/i,
    /from\s+([A-Za-z\s]+?)(?:\s+to|\s+visit|,|\.|$)/i
  ];

  for (const pat of startPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const resolved = resolveLocation(match[1].trim());
      if (resolved && locationsDB[resolved]) {
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

  const MAJOR_CITIES_SET = new Set(['Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala', 'Mohali', 'Bathinda', 'Pathankot', 'Hoshiarpur', 'Moga', 'Phagwara', 'Rupnagar', 'Firozpur', 'Kapurthala']);

  // Filter out start location
  const curStart = startLoc || memory.currentLocation || "Phagwara";
  let cleanStops = foundLocations.filter(loc => loc !== curStart && loc !== 'LPU' && loc !== 'LPU Campus');

  // Deduplicate stops with exact same coordinates
  const uniqueStops = [];
  const seenCoords = new Set();
  for (const s of cleanStops) {
    const loc = locationsDB[s];
    if (loc && loc.lat && loc.lon) {
      const coordKey = `${loc.lat.toFixed(3)},${loc.lon.toFixed(3)}`;
      if (seenCoords.has(coordKey)) continue;
      seenCoords.add(coordKey);
    }
    uniqueStops.push(s);
  }

  // If specific landmark recommendations exist, filter out broad regional cities mentioned in address/highway context
  const hasSpecificLandmarks = uniqueStops.some(s => !MAJOR_CITIES_SET.has(s));
  const finalStops = hasSpecificLandmarks ? uniqueStops.filter(s => !MAJOR_CITIES_SET.has(s)) : uniqueStops;

  return {
    start: curStart,
    stops: finalStops.length > 0 ? finalStops : cleanStops
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
