---
name: gis-maps-geospatial-engineering
description: "Use when designing GIS, OpenStreetMap, map rendering, route geometry, coordinate transforms, spatial joins, geocoding, Overpass queries, offline map data or geospatial storage for Road Guide."
---

# GIS, Maps and Geospatial Engineering

## Goal

Build geospatial behavior that is coordinate-correct, source-aware, testable and proportionate to Road Guide's actual needs. Do not equate map rendering, OSM tags or coordinate precision with measured environmental truth.

## Road Guide Baseline

Read [routing/GIS architecture](../../../docs/ai/ROUTING_GIS_AND_OSM.md), [system architecture](../../../docs/ai/SYSTEM_ARCHITECTURE.md) and [external sources](../../../docs/ai/EXTERNAL_DATA_SOURCES.md). Current runtime uses MapLibre Native in `src/components/RouteMap.tsx`, OpenFreeMap Liberty through `src/services/mapProvider.ts`, Valhalla route geometries and plain latitude/longitude values in `src/services/database.ts`. There is no spatial extension, OSMnx/Overpass runtime, GeoPackage, map matching or offline graph.

## Procedure

1. Identify the owning data boundary first: GPS persistence, route provider, map rendering or environmental join. Read the nearby implementation and tests before choosing a new library.
2. State coordinate conventions at each boundary. App objects are `{ latitude, longitude }`; RFC 7946 GeoJSON arrays are `[longitude, latitude]`. Convert once at the adapter and add an asymmetric-coordinate test that catches swapped axes.
3. Carry CRS, timestamp, horizontal accuracy, geometry type and source. Validate finite values and legal latitude/longitude ranges; do not assume decimal digits imply positional accuracy.
4. For OSM-derived data, inspect actual local tags and access rules: `highway`, `foot`, `access`, `surface`, `sidewalk`, `cycleway`, `leisure=park`, `landuse=forest/grass`, `natural=wood`. Missing tags are unknown, not prohibited/clean/quiet by default.
5. Separate map tiles, OSM database extracts, geocoding and route computation. Each provider has independent terms, attribution, retention, update and availability behavior.
6. Use Overpass only for bounded, reproducible investigation or a controlled service. Do not send wide/repeated city queries from the phone; respect shared-instance limits and OSM attribution/ODbL.
7. Use OSMnx for Python research and controlled graph/data preparation. Do not add a Python runtime to Android for routine map queries.
8. Add spatial indexes only after query volume/latency proves a need. For small pilot datasets, bounded bbox filtering plus exact geodesic checks may be sufficient. Evaluate R-tree/GeoPackage only with native SQLite, migration, file-size and update requirements stated.
9. Keep MapLibre behind its current adapter. Validate generated GeoJSON geometry, antimeridian/bounds behavior where relevant, empty/one-point routes and rendering simplification.
10. Before sharing derived maps/graphs, review ODbL and the separate tile/service terms. Store attribution and source/license metadata with any packaged data.

## Technology Fit

- **Current:** MapLibre + OpenFreeMap, OSM-backed Valhalla route geometry, direct GeoJSON rendering.
- **Research:** OSMnx for local graph exploration; Overpass for bounded tag checks.
- **Potential later:** GeoPackage/R-tree for a measured offline spatial query need.
- **Not justified by current source:** GIS database extensions or offline city graphs as a blanket architecture upgrade.

## Validation Checklist

- Coordinate order is tested, not visually guessed.
- Invalid, null, NaN and boundary coordinates have tests.
- Source, license, attribution, timestamp and spatial support are retained.
- Low-accuracy GPS is not promoted to street-level precision.
- OSM road/green tags are labeled as proxies and absent tags remain unknown.
- Route/map calls have bounded data size, timeouts and provider failure states.
- A spatial index/library is justified by an observed query profile.

## Primary References

- [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)
- [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright)
- [OSM Wiki](https://wiki.openstreetmap.org/)
- [Overpass API documentation](https://dev.overpass-api.de/overpass-doc/en/)
- [OSMnx documentation](https://osmnx.readthedocs.io/)
- [OGC GeoPackage](https://www.ogc.org/standard/geopackage/)
