# Multi-Stop Route Planner Agent — T14 (Punjab OpenStreetMap Edition)

CSE476 Agentic AI and Intelligent Automation — CA1 Project 1

## What it does

Given a set of stops across Punjab, India, the agent decides a sensible order to visit them in —
starting from wherever the traveler currently is (using real geographical coordinates from `punjab_locations.json`),
not necessarily the order the stops were requested in — and can optionally route back to the start
with a total-distance report.

## OpenStreetMap Data Integration (`punjab_locations.json`)

Location data for **15,670 real places** across Punjab was pre-parsed from the OpenStreetMap dataset into `punjab_locations.json`. At runtime, the agent loads this pre-processed JSON database directly (fast, lightweight, with zero external C-library package dependencies). For full reproducibility, `agent.py` includes a live `osmium` PBF stream handler fallback (`load_punjab_locations`) if a raw `punjab.pbf` file is placed in the project directory.
- Covers all major cities (Ludhiana, Amritsar, Jalandhar, Patiala, Mohali, Bathinda, Phagwara, Moga, Hoshiarpur, Pathankot, Firozpur, Barnala, Kapurthala, Sangrur, Mansa, etc.).
- Includes 2,457 hospitals, 1,050 clinics, and 238 station-type entries, plus universities (e.g. `LPU`), colleges, hotels, markets, and other amenities across every district.
- Performs case-insensitive, substring, and strict fuzzy location name resolution (`difflib`).
- Calculates real geographical distances using the Haversine formula on exact OSM GPS coordinates.

## The two tools

1. **`get_distance(a, b)`** — computes the real-world distance (km) between
   two named Punjab locations using the haversine formula on their coordinates.
   Results are cached in memory, so repeated lookups within a session are
   free rather than recomputed.
2. **`order_stops(start, stops, ...)`** — the acting tool. It runs a
   nearest-neighbor greedy loop (at each step, decide the next stop from the
   distances just returned by `get_distance`), then applies a 2-opt repair
   pass that swaps legs when doing so shortens the total route. This is
   where the actual routing decision is made — the agent isn't just
   formatting a list, it's picking an order.

## What memory does

The agent remembers, across turns in the same session:
- **Which stops have already been visited** — a later goal that repeats an
  earlier stop silently drops it instead of re-planning a visit.
- **Where the traveler currently is** — a new goal continues from the end
  of the previous trip rather than restarting from home.
- **A distance cache** — avoids recomputing a distance already looked up
  earlier in the conversation.

## One honest failure and how it was handled

The first version used plain nearest-neighbor with nothing else. On a small
test case (5–6 stops) it occasionally produced a visibly bad route — the
greedy choice would strand one stop far from everything else, and the route
would have to make a long, obviously avoidable trip back across the map to
reach it near the end. This is a well-known weakness of pure nearest-neighbor
routing: it's locally optimal at each step but not globally.

The fix was adding a 2-opt repair pass after the greedy pass: it tries
reversing segments of the route and keeps the reversal if it shortens the
total distance, repeating until no swap helps. This doesn't guarantee the
mathematically optimal route (that would need a much heavier algorithm for
larger stop counts), but it reliably removes the obvious crossing-path
mistakes nearest-neighbor makes on its own, which was the actual problem for
trip sizes this agent is meant to handle (roughly 3–15 stops).

## Web Interface & Gemini Flash AI Integration

An interactive visual web app is included in the project for intuitive map plotting and Gemini Flash AI route guidance:
- **Interactive OpenStreetMap (Leaflet.js)**: Plots route stops, custom map markers, and route polylines on an interactive Punjab map.
- **Gemini Flash AI Assistant**: Supports Gemini 2.5 / 1.5 Flash models via Google AI Studio API for natural language goal parsing (e.g. *"Plan a trip from Ludhiana visiting Golden Temple Amritsar, LPU Phagwara, and Jalandhar"*) and travel Q&A.
- **Agentic Control Panel**: Interactive location search across all 15,670 OSM locations, return-to-start option, session memory dashboard, and live 2-opt decision trace inspection.

### Running the Web Interface
To launch locally, run any local web server in this directory:
```bash
python -m http.server 8000
# Or using Node.js:
npx serve .
```
Then open `http://localhost:8000` in your web browser.

## Files

- `agent.py` — the agent, both tools, and the memory class (integrated with `punjab_locations.json`)
- `index.html` — interactive Web Application interface
- `style.css` — dark glassmorphism design system & layout styles
- `app.js` — Leaflet map renderer, 2-opt routing engine, session memory, and Gemini Flash API client
- `punjab_locations.json` — parsed location database containing 15,670 locations (1.5MB)
- `demo.ipynb` — runs the agent on 3 example goals in one session, showing the multi-step trace and the memory checks
- `README.md` — project documentation and rubric summary
- `build_notebook.py` — regenerates `demo.ipynb` (kept for reproducibility)

## Group work

All parts (core agent + add-on: return-to-start option and total-distance report + OpenStreetMap location integration + session memory + Web Interface & Gemini Flash AI) built by: Utkarsh Pandey
