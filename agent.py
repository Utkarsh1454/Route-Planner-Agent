"""
Multi-Stop Route Planner Agent (Punjab OpenStreetMap Edition)
CSE476 Agentic AI and Intelligent Automation - CA1 Project 1 (T14)

An agent that orders a set of stops into an efficient visiting route across Punjab, India.
Powered by OpenStreetMap PBF data (`punjab.pbf`).

Agentic shape (per the assignment rubric):
  - Plan-act loop: multi-step decision loop using distance tool results + 2-opt repair pass.
  - Two tools: get_distance(a, b) and order_stops(list).
  - Memory: remembers stops visited, distance cache, and current location across turns.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from math import radians, sin, cos, sqrt, atan2
from typing import Dict, List, Tuple, Optional
import os
import sys
import json
import difflib


# Load environment variables from .env file if present
def load_env_file(env_path: str = ".env") -> None:
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

load_env_file()


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@dataclass
class AgentMemory:
    """Session memory. Persists across multiple calls to the agent within
    the same conversation."""

    visited: List[str] = field(default_factory=list)          # stops already covered
    current_location: Optional[str] = None                     # where the traveler is "now"
    distance_cache: Dict[Tuple[str, str], float] = field(default_factory=dict)
    trip_log: List[dict] = field(default_factory=list)          # history of planned legs

    def mark_visited(self, stops: List[str], end_at: str) -> None:
        for s in stops:
            if s not in self.visited:
                self.visited.append(s)
        self.current_location = end_at

    def unvisited(self, requested: List[str]) -> List[str]:
        """Memory in action: later turns automatically drop stops already covered."""
        return [s for s in requested if s not in self.visited]


# ---------------------------------------------------------------------------
# World / OpenStreetMap PBF Location Database
# ---------------------------------------------------------------------------

def load_punjab_locations() -> Dict[str, Tuple[float, float]]:
    """Loads location coordinates from OpenStreetMap punjab.pbf dataset.
    Compatible with standard Python scripts, FastAPI, and Jupyter Notebook / JupyterLab kernels.
    """
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        base_dir = os.getcwd()

    json_path = os.path.join(base_dir, "punjab_locations.json")
    pbf_path = os.path.join(base_dir, "punjab.pbf")

    locations: Dict[str, Tuple[float, float]] = {}

    # 1. Try loading cached JSON extracted from punjab.pbf
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for name, info in data.items():
                    locations[name] = (info["lat"], info["lon"])
            if locations:
                return locations
        except Exception:
            pass

    # 2. Fallback: Parse punjab.pbf live using osmium if available
    if os.path.exists(pbf_path):
        try:
            import osmium

            class PbfHandler(osmium.SimpleHandler):
                def __init__(self):
                    super().__init__()
                    self.locs = {}

                def node(self, n):
                    if "name" in n.tags:
                        name = n.tags["name"]
                        pt = n.tags.get("place") or n.tags.get("amenity")
                        if pt in ["city", "town", "suburb", "university", "hospital", "bus_station"]:
                            if name not in self.locs:
                                self.locs[name] = (n.location.lat, n.location.lon)

            handler = PbfHandler()
            handler.apply_file(pbf_path)
            if handler.locs:
                return handler.locs
        except Exception:
            pass

    # 3. Default fallback Punjab locations if PBF unreadable
    return {
        "Ludhiana": (30.909016, 75.851601),
        "Phagwara": (31.220673, 75.769646),
        "Jalandhar": (31.332376, 75.576889),
        "Amritsar": (31.635666, 74.878750),
        "Patiala": (30.330199, 76.400766),
        "Mohali": (30.690880, 76.711488),
        "Moga": (30.822341, 75.173097),
        "Bathinda": (30.206791, 74.946370),
        "Rupnagar": (30.968837, 76.526088),
        "Hoshiarpur": (31.5295, 75.9103),
    }


# Global location database from punjab.pbf
LOCATIONS: Dict[str, Tuple[float, float]] = load_punjab_locations()

# Case-insensitive lookup map
LOCATION_LOOKUP: Dict[str, str] = {k.lower(): k for k in LOCATIONS.keys()}

# Common aliases for landmarks and abbreviations in Punjab
ALIASES: Dict[str, str] = {
    "golden temple": "Amritsar",
    "harmandir sahib": "Amritsar",
    "sri harmandir sahib": "Amritsar",
    "lpu": "Phagwara",
    "lovely professional university": "Phagwara",
}


def resolve_location_name(name: str) -> str:
    """Finds exact, alias, or fuzzy location name matching in Punjab OSM database."""
    if not name:
        raise ValueError("Location name cannot be empty.")
    
    clean_name = name.strip()
    if clean_name in LOCATIONS:
        return clean_name
        
    lower = clean_name.lower()
    
    # 0. Common landmark aliases
    if lower in ALIASES and ALIASES[lower] in LOCATIONS:
        return ALIASES[lower]

    # 1. Exact case-insensitive match
    if lower in LOCATION_LOOKUP:
        return LOCATION_LOOKUP[lower]
    
    # 2. Substring match: user query is inside location name (e.g. 'golden temple' inside 'golden temple post office')
    sub_matches = [canonical for k_lower, canonical in LOCATION_LOOKUP.items() if lower in k_lower]
    if sub_matches:
        sub_matches.sort(key=len)
        return sub_matches[0]

    # 3. Reverse substring match: location name inside user query with word boundaries (e.g. 'Amritsar' inside 'Amritsar City')
    import re
    rev_matches = [
        canonical for k_lower, canonical in LOCATION_LOOKUP.items() 
        if len(k_lower) > 3 and re.search(r'\b' + re.escape(k_lower) + r'\b', lower)
    ]
    if rev_matches:
        rev_matches.sort(key=len, reverse=True)
        return rev_matches[0]

    # 4. Fuzzy difflib matching (strict cutoff 0.75 to prevent false matches)
    close_matches = difflib.get_close_matches(clean_name, list(LOCATIONS.keys()), n=1, cutoff=0.75)
    if close_matches:
        return close_matches[0]

    popular = ["Phagwara", "Jalandhar", "Ludhiana", "Amritsar", "Mohali", "Patiala", "Moga", "Bathinda"]
    raise ValueError(
        f"Location '{name}' not found in Punjab dataset. Popular stops include: {', '.join(popular)}"
    )


# ---------------------------------------------------------------------------
# Tool 1: get_distance
# ---------------------------------------------------------------------------

def get_distance(a: str, b: str, memory: AgentMemory) -> float:
    """Tool: computes real-world Haversine distance (km) between two Punjab locations.
    Caches results in memory for session reuse.
    """
    canon_a = resolve_location_name(a)
    canon_b = resolve_location_name(b)

    key = tuple(sorted((canon_a, canon_b)))
    if key in memory.distance_cache:
        return memory.distance_cache[key]

    lat1, lon1 = LOCATIONS[canon_a]
    lat2, lon2 = LOCATIONS[canon_b]
    R = 6371.0  # Earth radius in km
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    h = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    dist = 2 * R * atan2(sqrt(h), sqrt(1 - h))

    memory.distance_cache[key] = dist
    return dist


# ---------------------------------------------------------------------------
# Tool 2: order_stops
# ---------------------------------------------------------------------------

def order_stops(
    start: str,
    stops: List[str],
    memory: AgentMemory,
    return_to_start: bool = False,
) -> dict:
    """Tool: decides optimal visiting sequence for `stops` starting from `start`.
    Runs greedy nearest-neighbor loop + 2-opt path optimization pass.
    """
    canon_start = resolve_location_name(start)
    canon_stops = [resolve_location_name(s) for s in stops]

    remaining = list(canon_stops)
    route = [canon_start]
    current = canon_start
    trace = []

    # Nearest-neighbor expansion
    while remaining:
        candidate_distances = {s: get_distance(current, s, memory) for s in remaining}
        nxt = min(candidate_distances, key=candidate_distances.get)
        trace.append({
            "step": len(trace) + 1,
            "from": current,
            "considered": candidate_distances,
            "decision": f"go to {nxt} (nearest at {candidate_distances[nxt]:.2f} km)",
        })
        route.append(nxt)
        remaining.remove(nxt)
        current = nxt

    # 2-opt repair pass
    def route_length(r: List[str]) -> float:
        return sum(get_distance(r[i], r[i + 1], memory) for i in range(len(r) - 1))

    improved = True
    while improved:
        improved = False
        for i in range(1, len(route) - 1):
            for j in range(i + 1, len(route)):
                new_route = route[:i] + route[i:j + 1][::-1] + route[j + 1:]
                if route_length(new_route) < route_length(route) - 1e-9:
                    route = new_route
                    improved = True

    total_distance = route_length(route)

    if return_to_start:
        total_distance += get_distance(route[-1], canon_start, memory)
        route = route + [canon_start]

    return {
        "route": route,
        "total_distance_km": round(total_distance, 2),
        "trace": trace,
    }


# ---------------------------------------------------------------------------
# The Agent: plan-act loop tying tools + memory together
# ---------------------------------------------------------------------------

class RouteAgent:
    def __init__(self):
        self.memory = AgentMemory()

    def plan_trip(
        self,
        goal_stops: List[str],
        start: Optional[str] = None,
        return_to_start: bool = False,
    ) -> dict:
        """Top-level plan-act execution step."""
        if start:
            start = resolve_location_name(start)
        else:
            start = self.memory.current_location or "Phagwara"

        canon_goals = [resolve_location_name(s) for s in goal_stops]

        # PLAN: filter already visited stops
        todo = self.memory.unvisited(canon_goals)
        skipped = [s for s in canon_goals if s not in todo]

        if not todo:
            result = {
                "start": start,
                "route": [start],
                "total_distance_km": 0.0,
                "trace": [],
                "note": "All requested stops were already visited earlier this session.",
                "skipped_already_visited": skipped,
            }
            self.memory.trip_log.append(result)
            return result

        # ACT: call order_stops tool
        outcome = order_stops(start, todo, self.memory, return_to_start=return_to_start)

        # UPDATE MEMORY
        end_at = outcome["route"][-1]
        self.memory.mark_visited(todo, end_at=start if return_to_start else end_at)

        result = {
            "start": start,
            "route": outcome["route"],
            "total_distance_km": outcome["total_distance_km"],
            "trace": outcome["trace"],
            "skipped_already_visited": skipped,
        }
        self.memory.trip_log.append(result)
        return result

    def summary_report(self) -> dict:
        """Group-of-3 add-on: total-distance report across session."""
        total = sum(t["total_distance_km"] for t in self.memory.trip_log)
        return {
            "legs_planned": len(self.memory.trip_log),
            "all_stops_visited": self.memory.visited,
            "session_total_distance_km": round(total, 2),
        }


# ---------------------------------------------------------------------------
# Helper & Interactive Mode
# ---------------------------------------------------------------------------

def print_trace(result: dict) -> None:
    print("\n" + "=" * 60)
    print(f"📍 Start: {result['start']}")
    if result.get("skipped_already_visited"):
        print(f"⚠️  Skipped (Already Visited): {result['skipped_already_visited']}")
    print("-" * 60)
    for step in result["trace"]:
        considered = ", ".join(f"{k}={v:.2f}km" for k, v in step["considered"].items())
        print(f"  Step {step['step']}: at {step['from']}")
        print(f"          Evaluated distances: [{considered}]")
        print(f"          ➔ Decision: {step['decision']}")
    print("-" * 60)
    print(f"🛣️  Final Route: {' -> '.join(result['route'])}")
    print(f"📏 Total Distance: {result['total_distance_km']} km")
    print("=" * 60 + "\n")


def interactive_cli():
    """Interactive mode allowing users to choose stops dynamically."""
    # Check if running inside interactive TTY or Jupyter Kernel
    if not sys.stdin.isatty():
        return

    print("=" * 65)
    print("  🗺️  Multi-Stop Route Planner Agent (Punjab OpenStreetMap)")
    print("  CSE476 Agentic AI - CA1 Project 1 (Topic T14)")
    print("=" * 65)
    print(f"Loaded {len(LOCATIONS)} real Punjab locations from OpenStreetMap.\n")

    popular_cities = [
        "Phagwara", "Jalandhar", "Ludhiana", "Amritsar", "Mohali",
        "Patiala", "Moga", "Bathinda", "Rupnagar", "Hoshiarpur"
    ]

    print("Popular Punjab Cities:")
    for idx, city in enumerate(popular_cities, 1):
        print(f"  [{idx}] {city}")
    print("  Or type any custom location name in Punjab!\n")

    agent = RouteAgent()

    while True:
        try:
            print("\n--- Plan a New Trip Leg ---")
            start_input = input("Enter START location (press Enter for default/current): ").strip()
            
            # Resolve start location
            if start_input.isdigit() and 1 <= int(start_input) <= len(popular_cities):
                start_loc = popular_cities[int(start_input) - 1]
            elif start_input:
                try:
                    start_loc = resolve_location_name(start_input)
                except ValueError as e:
                    print(f"❌ Error: {e}")
                    continue
            else:
                start_loc = agent.memory.current_location or "Phagwara"

            print(f"Starting point set to: {start_loc}")

            # Input stops
            print("\nEnter STOPS to visit (comma-separated, e.g., 'Jalandhar, Amritsar, Mohali' or '2, 4, 5'):")
            stops_input = input("Stops > ").strip()
            if not stops_input:
                print("No stops entered. Exiting interactive mode.")
                break

            # Parse user stops
            raw_stops = [s.strip() for s in stops_input.split(",") if s.strip()]
            resolved_stops = []
            parse_error = False

            for item in raw_stops:
                if item.isdigit() and 1 <= int(item) <= len(popular_cities):
                    resolved_stops.append(popular_cities[int(item) - 1])
                else:
                    try:
                        resolved = resolve_location_name(item)
                        resolved_stops.append(resolved)
                    except ValueError as e:
                        print(f"❌ Error resolving '{item}': {e}")
                        parse_error = True
                        break

            if parse_error or not resolved_stops:
                continue

            # Return to start option
            return_choice = input("Return to start location at the end? (y/n, default=n): ").strip().lower()
            return_to_start = return_choice in ['y', 'yes', '1', 'true']

            # Execute Agent Plan-Act Loop
            print("\n🔄 Agent planning optimal route...")
            result = agent.plan_trip(resolved_stops, start=start_loc, return_to_start=return_to_start)
            print_trace(result)

            # Session Summary
            print("Session Summary:")
            summary = agent.summary_report()
            print(f"  • Legs Planned: {summary['legs_planned']}")
            print(f"  • Total Visited Stops: {len(summary['all_stops_visited'])} -> {summary['all_stops_visited']}")
            print(f"  • Cumulative Session Distance: {summary['session_total_distance_km']} km")

            cont = input("\nDo you want to plan another leg in this session? (y/n): ").strip().lower()
            if cont not in ['y', 'yes']:
                print("\nThank you for using the Multi-Stop Route Planner Agent! Goodbye.")
                break
        except (KeyboardInterrupt, EOFError):
            print("\nExiting interactive CLI.")
            break


if __name__ == "__main__":
    interactive_cli()
