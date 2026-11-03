# Routing, GIS and OpenStreetMap

## Current Map and Routing Path

- `src/components/RouteMap.tsx` renders MapLibre Native with a style URL from `src/services/mapProvider.ts`; default style is OpenFreeMap Liberty. The visible map uses OSM-derived tiles and attribution. It is not a Google Maps, Mapbox or MAPS.ME SDK integration.
- `src/services/routeService.ts` posts two endpoint coordinates to `https://valhalla1.openstreetmap.de/route`, requests `costing: pedestrian`, `units: kilometers`, `alternates: 2`, parses Valhalla polyline6 shapes and keeps at most three trip candidates.
- `src/app/route-planner.tsx` geocodes addresses with `expo-location` platform geocoding. It asks for disclosure consent, sends exact endpoints to Valhalla, and fetches city-level conditions separately.
- `src/services/routeRecommendation.ts` selects the lowest finite `durationMinutes`; no environmental factor, preference, route comfort or distance weight participates.
- `src/app/route/[id].tsx` hands off to Apple Maps or Google navigation; the external app recalculates its own route. Route Guide does not provide turn-by-turn guidance.

Public routing endpoints are prototypes, not production dependencies: they may throttle, fail, alter policy or disappear and have no app-level availability guarantee. The current route search needs connectivity. Bookmarks persist candidate geometry locally, but unbookmarked alternatives are in-memory only.

## GIS Fundamentals for This Project

- GeoJSON follows RFC 7946 and uses WGS 84 longitude/latitude coordinate order in geometry arrays: `[longitude, latitude]`. App-domain objects currently use `{ latitude, longitude }`; `RouteMap` explicitly swaps them when building GeoJSON. Preserve this distinction at every adapter boundary.
- OSM is an editable geographic database, not a uniform sensor network. Relevant tags include `highway=*` for road/path class, `foot=*`, `access=*`, `surface=*`, `lit=*`, `sidewalk=*`, `cycleway=*`, `leisure=park`, `landuse=forest/grass` and `natural=wood`. Tag completeness and local mapping practice vary. A road class or green-space polygon is a proxy, not a measurement of traffic, noise, pollutant concentration, tree canopy or accessibility.
- OSM data is published under ODbL; attribution is required and database/share-alike obligations may apply to derivative databases. Review license guidance for any extracted/combined route graph and distribution. Tile service terms are separate from OSM data licensing.
- A WGS84 coordinate does not define spatial uncertainty. Carry horizontal accuracy, timestamp and source. Do not infer curbside precision from coordinate decimal places or grid interpolation.
- `route_points` has timestamp indexes but no spatial index. For a small pilot, bounding-box filters plus exact geodesic checks may be sufficient. Add SQLite R-tree/GeoPackage only when measured query volume and retention justify native integration and schema migration complexity.

## Tools and Suitability

| Tool | Good fit | Poor fit / cautions | Road Guide recommendation |
|---|---|---|---|
| OSMnx | Python research, extracting a local study-area road graph, graph analysis, reproducible offline data prep | Not a normal Android runtime dependency; OSM/Overpass service policies still apply | Use in research or a controlled data-preparation pipeline, not in the app |
| Overpass API | Ad hoc OSM tag/geometry queries and prototyping | Shared public infrastructure, query/rate/resource limits; not a dependable production mobile backend | Do not issue broad/high-frequency client queries; use bounded research queries, a provider or self-hosted instance |
| Valhalla | OSM-based multimodal routing, costing profiles and route alternatives; current prototype is already integrated | Public demo availability, graph freshness and exact routing semantics are provider-dependent; environmental scoring is not supplied automatically | Keep the adapter; use a controlled host or documented service before release |
| GraphHopper | OSM routing engine, customizable profiles and hosted API; Java ecosystem | Hosted API key/pricing/terms; self-hosting needs graph imports, resources and license review; not a drop-in environmental optimizer | Evaluate if its profile/hosting tradeoffs fit a selected market; do not add only for popularity |
| OSRM | Fast OSM road routing, especially vehicle profiles; self-hostable | Standard routing profiles do not establish quiet/clean path quality; server is a deployment dependency; public demo is not SLA-backed | More relevant if vehicle routing becomes a goal; not the first pedestrian route choice |
| MapLibre Native | Native map rendering and style flexibility; already used | Basemap/style/tiles still have separate availability, attribution and usage terms | Keep behind `RouteMap` and `mapProvider` |
| GeoPackage / OGC | Portable SQLite-based offline geospatial vector/raster data and spatial reference metadata | Larger files, updates, indexing and native/query integration need product-specific design | Consider for an offline area pack only after a bounded pilot proves need |

## Routing and Environmental Optimization

A router provides feasible network paths and ETA estimates; it does not guarantee an environmental optimum. Generate candidates under the correct profile, then evaluate edge/segment costs using evidence with compatible spatial and temporal resolution. Keep hard constraints (walk access, closures, accessibility, maximum detour) separate from soft preferences.

A suitable first model is a deterministic, versioned route score with explicit inputs and missing-data state. Compare Pareto tradeoffs (time, distance and supported environmental metrics) before choosing a default. If a candidate's claimed exposure change is within the uncertainty of the source, present “unknown/no reliable difference” rather than a winner. Never assign zero exposure to absent data.

For graph algorithms, Dijkstra is appropriate for non-negative edge weights; A* can reduce explored nodes with an admissible heuristic. Production road-network routing libraries already implement graph import, access rules, turn costs and profile-specific weights; do not hand-roll a city router before a measured need. A post-router ranker is a smaller next step than replacing the routing engine.

## Incremental GIS Plan

1. Keep the existing MapLibre and Valhalla service adapters; add tests around provider request/response and candidate identity before expanding functionality.
2. Select one pilot city and inspect OSM tag completeness for walk access, major-road proximity, parks and paths. Document licenses and refresh cadence.
3. Add a versioned segment representation and provenance-preserving spatial join outside raw GPS capture.
4. Prototype route-level features with a bounded data pack; compare to local observations and record uncertainty.
5. Only then choose a local graph package, spatial database/index or offline routing engine.

## References

See [external sources](./EXTERNAL_DATA_SOURCES.md) for official OSM, Overpass, Valhalla, GraphHopper, OSRM, GeoJSON and GeoPackage links and deployment/licensing notes.
