"""
Unit Test Suite for Multi-Stop Route Planner Agent
CSE476 Agentic AI - CA1 Project 1 (Topic T14)

Run with:
  py -m pytest test_agent.py
  or:
  py -m unittest test_agent.py
"""

import unittest
from agent import (
    RouteAgent,
    AgentMemory,
    get_distance,
    order_stops,
    resolve_location_name,
    LOCATIONS
)


class TestRoutePlannerAgent(unittest.TestCase):

    def setUp(self):
        self.memory = AgentMemory()

    def test_get_distance_symmetry(self):
        """Test that get_distance(a, b) == get_distance(b, a)."""
        dist1 = get_distance("Phagwara", "Ludhiana", self.memory)
        dist2 = get_distance("Ludhiana", "Phagwara", self.memory)
        self.assertAlmostEqual(dist1, dist2, places=4)
        self.assertGreater(dist1, 0.0)

    def test_distance_cache(self):
        """Test that calculated distances are stored in memory cache."""
        key = tuple(sorted(("Phagwara", "Ludhiana")))
        self.assertNotIn(key, self.memory.distance_cache)
        
        dist = get_distance("Phagwara", "Ludhiana", self.memory)
        self.assertIn(key, self.memory.distance_cache)
        self.assertEqual(self.memory.distance_cache[key], dist)

    def test_resolve_location_name_exact_and_alias(self):
        """Test exact name, case-insensitivity, and alias resolution."""
        # Exact match
        self.assertEqual(resolve_location_name("Phagwara"), "Phagwara")
        # Case-insensitive
        self.assertEqual(resolve_location_name("amritsar"), "Amritsar")
        # Alias
        self.assertEqual(resolve_location_name("golden temple"), "Amritsar")
        self.assertEqual(resolve_location_name("lpu"), "Phagwara")

    def test_resolve_location_name_invalid(self):
        """Test that invalid non-existent location names raise ValueError."""
        with self.assertRaises(ValueError):
            resolve_location_name("NonExistentUnknownPlaceXYZ123")

    def test_order_stops_2opt(self):
        """Test nearest-neighbor + 2-opt route calculation."""
        stops = ["Amritsar", "Jalandhar", "Ludhiana"]
        result = order_stops("Phagwara", stops, self.memory, return_to_start=False)
        
        self.assertIn("route", result)
        self.assertIn("total_distance_km", result)
        self.assertEqual(result["route"][0], "Phagwara")
        self.assertEqual(set(result["route"]), {"Phagwara", "Amritsar", "Jalandhar", "Ludhiana"})
        self.assertGreater(result["total_distance_km"], 0.0)

    def test_memory_unvisited_dedup(self):
        """Test that AgentMemory unvisited() correctly filters already visited stops."""
        agent = RouteAgent()
        
        # Trip 1
        res1 = agent.plan_trip(["Jalandhar", "Ludhiana"], start="Phagwara")
        self.assertIn("Jalandhar", agent.memory.visited)
        self.assertIn("Ludhiana", agent.memory.visited)

        # Trip 2 with overlapping stops
        res2 = agent.plan_trip(["Jalandhar", "Amritsar"])
        self.assertIn("Jalandhar", res2["skipped_already_visited"])
        self.assertEqual(res2["route"], ["Ludhiana", "Amritsar"])


if __name__ == "__main__":
    unittest.main()
