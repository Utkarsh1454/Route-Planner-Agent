# Multi-Stop Route Planner Agent (Punjab OpenStreetMap Edition)

An agent that plans multi-stop trips across Punjab, India. Given a starting point and a set of stops, it decides a sensible order to visit them in, using real geographical coordinates pulled from OpenStreetMap, rather than just visiting stops in the order they were requested. It can also route back to the start and report the total distance covered.

## What it does

Give the agent a starting location and a list of stops anywhere in Punjab, and it works out a short, sensible route between them using real-world distances rather than guesswork. It's not just reordering a list. The nearest-neighbor and 2-opt logic described below is the actual decision-making step, and it's what separates this from a static itinerary generator.

## OpenStreetMap data integration

Location data for 15,670 real places across Punjab has been parsed from the OpenStreetMap dataset into `punjab_locations.json`. At runtime, the agent loads this pre-processed JSON database directly, which keeps things fast and lightweight with zero external C-library dependencies. For full reproducibility, `agent.py` also includes a live `osmium` PBF stream handler fallback (`load_punjab_locations`) that runs if a raw `punjab.pbf` file is placed in the project directory.

- Covers all major cities: Ludhiana, Amritsar, Jalandhar, Patiala, Mohali, Bathinda, Phagwara, Moga, Hoshiarpur, Pathankot, Firozpur, Barnala, Kapurthala, Sangrur, Mansa, and more.
- Includes 2,457 hospitals, 1,050 clinics, and 238 station-type entries, along with universities (including LPU), colleges, hotels, markets, and other amenities across every district.
- Resolves location names with case-insensitive, substring, and fuzzy matching (`difflib`), so a slightly misspelled or partial name still finds the right place.
- Calculates real geographical distances using the Haversine formula on exact OSM GPS coordinates.

## The two tools

1. **`get_distance(a, b)`** computes the real-world distance in kilometers between two named Punjab locations using the haversine formula on their coordinates. Results are cached in memory, so repeated lookups within a session are free instead of being recomputed.
2. **`order_stops(start, stops, ...)`** is the tool that actually does the routing. It runs a nearest-neighbor greedy loop, deciding the next stop at each step from the distances just returned by `get_distance`, then applies a 2-opt repair pass that swaps legs whenever doing so shortens the total route. This is where the routing decision itself gets made; the agent isn't just formatting a list, it's picking an order.

## Memory

The agent remembers the following across turns within a session:

- **Which stops have already been visited.** A later goal that repeats an earlier stop silently drops it instead of re-planning a visit.
- **Where the traveler currently is.** A new goal continues from the end of the previous trip rather than restarting from home.
- **A distance cache**, which avoids recomputing a distance already looked up earlier in the conversation.

## A failure mode, and how it was fixed

The first version used plain nearest-neighbor routing with nothing else. On small test cases (5 to 6 stops) it occasionally produced a visibly bad route: the greedy choice would strand one stop far from everything else, forcing a long, obviously avoidable trip back across the map near the end. This is a well-known weakness of pure nearest-neighbor routing. It's locally optimal at each step but not globally.

The fix was adding a 2-opt repair pass after the greedy pass. It tries reversing segments of the route and keeps the reversal if it shortens the total distance, repeating until no swap helps. This doesn't guarantee the mathematically optimal route (that would need a heavier algorithm for larger stop counts), but it reliably removes the obvious crossing-path mistakes that nearest-neighbor makes on its own, which was the actual problem for the trip sizes this agent is meant to handle (roughly 3 to 15 stops).

## Web interface and Gemini Flash AI integration

An interactive visual web app is included for map plotting and natural-language route planning:

- **Interactive OpenStreetMap (Leaflet.js)**: plots route stops, custom map markers, and route polylines on an interactive Punjab map.
- **Gemini Flash AI assistant**: supports Gemini 2.5 and 1.5 Flash models via the Google AI Studio API for natural language goal parsing (for example, "Plan a trip from Ludhiana visiting Golden Temple Amritsar, LPU Phagwara, and Jalandhar") and travel Q&A.
- **Agentic control panel**: interactive location search across all 15,670 OSM locations, a return-to-start option, a session memory dashboard, and a live 2-opt decision trace inspector.

### Running the web interface

Launch any local web server from this directory:

```bash
python -m http.server 8000
# or, using Node.js:
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Files

- `agent.py`, the agent, both tools, and the memory class, integrated with `punjab_locations.json`
- `index.html`, the interactive web application interface
- `style.css`, the dark glassmorphism design system and layout styles
- `app.js`, the Leaflet map renderer, 2-opt routing engine, session memory, and Gemini Flash API client
- `punjab_locations.json`, the parsed location database containing 15,670 locations (about 1.5 MB)
- `demo.ipynb`, runs the agent on three example goals in one session, showing the multi-step trace and the memory checks
- `README.md`, this file
- `build_notebook.py`, regenerates `demo.ipynb` and is kept for reproducibility

## Author

Built by Utkarsh Pandey: core agent, return-to-start option and total-distance report, OpenStreetMap location integration, session memory, and the web interface with Gemini Flash AI.
