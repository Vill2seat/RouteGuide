---
name: routing-route-optimization
description: "Use when implementing pedestrian, cycling, transit or vehicle route search, alternatives, route graphs, Dijkstra/A*, offline routing, route-provider integration or environmental route ranking for Road Guide."
---

# Routing and Route Optimization

## Goal

Produce feasible, explainable candidates first; optimize only against supported objectives and valid route data. Keep hard access/safety constraints separate from soft preferences.

## Road Guide Baseline

Read [routing/GIS](../../../docs/ai/ROUTING_GIS_AND_OSM.md), [environmental model](../../../docs/ai/ENVIRONMENTAL_INTELLIGENCE.md), [audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md) and [roadmap](../../../docs/ai/TARGET_ARCHITECTURE_AND_ROADMAP.md). `src/services/routeService.ts` requests pedestrian routes from a public Valhalla endpoint, asks for two alternates, decodes polyline6 and returns up to three candidates. `routeRecommendation.ts` chooses the shortest duration only. Exact endpoints are disclosed to the provider. Do not describe the current behavior as clean/quiet route optimization.

## Procedure

1. Define the mode/profile, valid network access, origin/destination, user constraints, candidate count and fallback behavior. Confirm whether the request is route retrieval, ranking, map matching or turn-by-turn navigation.
2. Reuse the current provider boundary. Evaluate Valhalla first; compare GraphHopper/OSRM only against coverage, pedestrian/cycle profile, alternatives, hosting, license, key requirements, SLA, privacy and total cost.
3. Validate coordinates, response status/schema, geometry, distance, duration and candidate identity. Reject malformed or impossible values. Use explicit request/group IDs and prevent stale concurrent responses from updating active UI/cache state.
4. Treat provider ETA and geometry as estimates. Record provider/profile/request time and avoid claiming navigation guidance when the app hands off to an external maps app.
5. Rank only after candidate feasibility. Keep access rules, closures, accessibility and maximum detour as hard constraints. Keep time/distance/environment as separate objectives.
6. For one criterion with non-negative edge weights, Dijkstra is a standard baseline; A* can reduce search with an admissible heuristic. Prefer a proven routing engine for OSM import, turn costs and profile-specific legality over a hand-written city graph.
7. For multiple criteria, preserve a Pareto set or use an explicit, versioned normalization/weight model. Explain why a route wins. Do not use the historical 30/25/20/15/10 weights or five-minute bonus as validated science.
8. If environmental data is missing, stale or coarser than the route, return time/distance alternatives with a clear unknown state. Never treat missing as zero exposure or turn an OSM road class into measured pollution/noise.
9. Build deterministic fixture tests for ties, invalid durations, provider errors, route geometry, out-of-order network completion, candidate grouping, constraints and missing evidence.
10. Treat offline routing as a separate product slice: graph source/update/license, area selection, disk budget, stale graph state, connectivity fallback and route parity all need decisions.

## Algorithm and Provider Guidance

- Use Valhalla/GraphHopper/OSRM as routing engines, not as implicit environmental truth.
- Use network-aligned segments and declared edge costs for later exposure ranking.
- Avoid optimizing every environmental metric in one opaque scalar before source validation.
- Start with one pilot mode/city and compare against a known baseline route.
- A public demo endpoint is suitable for development discovery, not a production availability promise.

## Validation Checklist

- Candidate feasibility and ranking are tested separately.
- Every candidate belongs to exactly one request/group; stale completions cannot overwrite newer results.
- Fastest/shortest labels use the complete candidate set.
- Walking/cycle access and user hard constraints are preserved.
- Every score can be reconstructed from inputs, model version and weights.
- Unavailable environmental evidence produces neutral/unknown messaging.
- Provider terms, user disclosure and exact coordinate transmission are reviewed.
- Offline claims match actually cached maps/graphs and their freshness.

## Primary References

- [Valhalla API](https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/)
- [GraphHopper Routing API](https://docs.graphhopper.com/openapi/routing)
- [OSRM API](https://project-osrm.org/docs/v5.24.0/api/)
- [Dijkstra's algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm)
- [A* search](https://en.wikipedia.org/wiki/A*_search_algorithm)
