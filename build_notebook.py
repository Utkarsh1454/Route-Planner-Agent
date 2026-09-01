"""
Generates demo.ipynb notebook for CSE476 CA1 Project 1 (Topic T14)
using Punjab OpenStreetMap dataset (`punjab.pbf`).
"""

import json

cells = [
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# Multi-Stop Route Planner Agent — Punjab OpenStreetMap Demo\n",
            "**CSE476 CA1 Project 1 — Topic T14 (Multi-Stop Route Planner)**\n",
            "\n",
            "This notebook demonstrates a **real agentic plan-act loop** using real-world geographical data extracted from the **`punjab.pbf` OpenStreetMap dataset**.\n",
            "\n",
            "### Agentic Criteria Met:\n",
            "1. **Two Tools Called**: `get_distance(a, b)` (Haversine formula on OSM coordinates with distance caching) and `order_stops(start, stops)` (Greedy nearest-neighbor loop + 2-opt path optimization pass).\n",
            "2. **Plan-Act Loop**: Multi-step decision trace where each step selects the optimal stop based on tool outputs.\n",
            "3. **Session Memory**: Remembers visited locations across turns, continues from the previous trip's endpoint, and caches calculated distances."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "from agent import RouteAgent, print_trace, LOCATIONS\n",
            "\n",
            "print(f\"Loaded {len(LOCATIONS)} real Punjab locations from punjab.pbf dataset.\")\n",
            "agent = RouteAgent()"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## Example Goal 1 — \"Plan an efficient trip to Jalandhar, Ludhiana, Amritsar, Mohali starting from Phagwara\"\n",
            "\n",
            "The agent evaluates candidates dynamically using `get_distance` and applies a 2-opt repair pass to optimize the overall Punjab travel itinerary."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "goal_1 = [\"Jalandhar\", \"Ludhiana\", \"Amritsar\", \"Mohali\"]\n",
            "result_1 = agent.plan_trip(goal_1, start=\"Phagwara\")\n",
            "print_trace(result_1)"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## Example Goal 2 — \"Now visit Jalandhar, Patiala, Moga, Bathinda\"\n",
            "\n",
            "**Memory Demonstration**:\n",
            "- **Memory in Action**: `Jalandhar` was visited in Goal 1, so the agent automatically skips it.\n",
            "- **Location Continuity**: The trip starts automatically at `Mohali` (the endpoint of Goal 1)."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "goal_2 = [\"Jalandhar\", \"Patiala\", \"Moga\", \"Bathinda\"]\n",
            "result_2 = agent.plan_trip(goal_2)\n",
            "print_trace(result_2)\n",
            "\n",
            "assert result_2[\"start\"] == \"Mohali\", \"Should continue from the last trip endpoint (Mohali)\"\n",
            "assert \"Jalandhar\" in result_2[\"skipped_already_visited\"], \"Jalandhar should be skipped as it was visited in Goal 1\"\n",
            "print(\"PASS: Memory check passed — Jalandhar was skipped and trip continued from Mohali.\")"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## Example Goal 3 — \"Visit Rupnagar and Hoshiarpur, then return to start\"\n",
            "\n",
            "Demonstrates the **Group of 3 add-on: Return-to-Start option**."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "goal_3 = [\"Rupnagar\", \"Hoshiarpur\"]\n",
            "result_3 = agent.plan_trip(goal_3, return_to_start=True)\n",
            "print_trace(result_3)\n",
            "\n",
            "assert result_3[\"route\"][0] == result_3[\"route\"][-1], \"Route should end at starting location\"\n",
            "print(\"PASS: Return-to-start check passed.\")"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## Session Summary Report (Group-of-3 Add-on)\n",
            "\n",
            "A cumulative total-distance report aggregated across all planned legs in the session."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "summary = agent.summary_report()\n",
            "summary"
        ]
    }
]

notebook = {
    "cells": cells,
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3"
        },
        "language_info": {
            "name": "python",
            "version": "3.13.1"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 2
}

with open("demo.ipynb", "w", encoding="utf-8") as f:
    json.dump(notebook, f, indent=2)

print("demo.ipynb generated successfully!")
