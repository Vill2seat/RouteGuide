# Decisions, Technical Debt and Glossary

## Decision Record Status

There is no formal ADR directory or verified decision history in the checked-in documentation. The entries below are **inferred current choices**, not historical approvals. Confirm them with product owners before treating them as binding decisions.

| ID | Inferred choice | Evidence | Revisit when |
|---|---|---|---|
| RG-OBS-01 | Local-first history without account/cloud | `database.ts`, `settings.tsx`, `src/README.md` | User explicitly needs sync/backup or multi-device use |
| RG-OBS-02 | Environmental honesty over route-level claims | `cityConditions.ts`, route planner/detail disclaimers, `RouteGuide_TZ.md` | Route-specific sources pass coverage and validation |
| RG-OBS-03 | Map rendering is isolated behind MapLibre `RouteMap` / `mapProvider` | `components/RouteMap.tsx`, `services/mapProvider.ts` | A new provider materially improves offline, privacy, terms or quality |
| RG-OBS-04 | Expo/React Native is current cross-platform implementation | `src/package.json`, app/screens, Expo config | A measured native feature gap justifies a Kotlin/Swift module or platform rewrite |
| RG-OBS-05 | Public Valhalla/Open-Meteo/OpenFreeMap endpoints support MVP discovery | defaults in app config/services and `src/README.md` | Public distribution, usage volume, commercial use or SLA need |
| RG-OBS-06 | Automatic recording defaults to enabled after profile and foreground permission | `database.ts`, `onboarding.tsx` | Consent/OS store policy or user research requires explicit opt-in default |

## Owner Decisions Recorded 2026-11-03

These are approved product targets. They do not prove that the technology or data sources are already implemented or available.

- **Pilot:** Kazan, Republic of Tatarstan, Russian Federation.
- **MVP platform:** Android, Kotlin, Jetpack Compose and Room.
- **Maps/data direction:** OpenStreetMap with OSM/Overpass-compatible geodata; evaluate Valhalla or OSRM for routing.
- **Environmental source candidates:** Open-Meteo and CAMS for weather/air, subject to Kazan coverage, legal terms and reachability from the Russian target network.
- **MVP activity labels:** walking, running, car and bus; custom ML is excluded. Car/bus discrimination remains a feasibility check.
- **MVP flow:** recording → local save → environmental analysis → score/explanation → history → alternative route as the final feature stage.
- **Deferred:** custom ML, cloud/account, social, wearable, microphone noise, personalized health dose and full Google Timeline.

## Decisions Still Requiring Owner Approval

The product scope is selected, but the following technical semantics and transition policies are not yet decided.

| ID | Decision | Evidence / why it matters | Recommended default pending approval |
|---|---|---|---|
| RG-OPEN-01 | What exactly does Exposure Score 0–100 mean: higher = favorable route or higher exposure? | Product name and goal can imply opposite directions; score must be explainable. | Approve label, direction, normalization, factor contribution and examples before RG-DEV-011. |
| RG-OPEN-02 | What is the confidence/coverage percentage formula? | Product asks for a percentage; it must not be presented as statistical confidence without calibration. | Define it as explicit data coverage/freshness completeness unless a calibrated model is approved. |
| RG-OPEN-03 | How should partial/no environmental data affect score and recommendation? | Open-Meteo/CAMS resolution and coverage may not support all segments or timestamps. | Missing remains unknown; withhold environmental winner when evidence is inadequate. |
| RG-OPEN-04 | What activity source may distinguish car from bus without custom ML? | Android activity APIs may only return in-vehicle; transit matching requires verified Kazan data. | Use `motorized/unknown` and manual correction unless a validated discriminator is approved. |
| RG-OPEN-05 | Must legacy Expo trips migrate to Room, and must native app update over the same package/signing identity? | Existing records are in SQLCipher; native Room is a new storage stack and key lifecycle. | Preserve source data; approve migration/import and package/signing path before RG-DEV-006. |
| RG-OPEN-06 | Is offline map/route analysis required in MVP? | OSM data, tiles, graph and environmental grids have different licenses and package/update costs. | Keep local history usable; defer offline routing unless required for the accepted Kazan journey. |
| RG-OPEN-07 | What are recording consent, retention, export/delete and crash-log policies for the native app? | Exact movement history is sensitive; existing Expo defaults do not automatically define native consent. | No cloud/account; pause/delete controls and local-only storage until separately approved. |

## Technical Debt and Risks

| Priority | Debt/risk | Evidence | Recommended treatment |
|---|---|---|---|
| High before MVP analysis | No route-level exposure or validated environmental ranker | Current provider reads area PM2.5/weather only; route ranker uses duration | Kazan source validation, approved score contract and segment join before claims |
| High before production dependency | Public providers have no app-controlled SLA/retention | README and endpoint defaults | Validate current terms/quotas and define fallback/hosting per market |
| Medium | Candidate group and async cache ownership are incorrect under detail/concurrency cases | `getRouteCandidateGroupById()` and route request cache in `routeService.ts` | Fix identities, stale response handling and tests first |
| Medium | Test scripts omit existing suites; some excluded tests fail/hang | `package.json`, race and stop test files | Reconcile test contracts; bounded, isolated suites |
| Medium | Early product documents retain unsupported claims and legacy provider proposals | Root docs compared with current source/README | Mark proposal/archival status after product approval |
| Medium | Screen-to-singleton coupling complicates UI/service isolation | Screens directly call `SQLiteDB` and provider services | Introduce small contracts at new boundaries; avoid broad rewrite |
| Medium before Android release | Generated native config and device background behavior unverified | `app.config.js`, `app.json`; no checked-in Android source | Clean prebuild, inspect output, test real devices and store policy |
| Low until measured | No spatial index/offline graph/provider-neutral environmental store | Current schema and source | Add only after pilot queries/data-size require it |
| Low / product decision | Duplicate `clearAll` and `clearAllLocalData` table operations | `database.ts` | Revisit with deletion semantics; not a reason to block research |

## Non-Goals for Near-Term Architecture

- Do not rewrite React Native to Kotlin/Compose just because the product is Android-focused.
- Do not add Room, GraphHopper, OSMnx, GeoPackage, Firebase, analytics, ads or a server without a requirement and cost/privacy decision.
- Do not use one global Exposure Score until units, normalization, missingness and validation are defined.
- Do not claim that public APIs, OSM data or a green polygon provide street-level truth.

## Glossary

| Term | Meaning in this project |
|---|---|
| Track point | One OS-delivered location sample with timestamp, coordinate and accuracy metadata |
| Route | Current DB recording session with points and summary; not necessarily a route-network path |
| Route candidate | A planned network path returned by Valhalla, with geometry, distance and estimated duration |
| Trip | A movement interval currently derived for display by `dayTimeline.ts` |
| Stop / visit | A likely stationary interval derived from GPS heuristics; optional user label is stored separately |
| Transport mode override | User correction for route or time-bounded points, taking precedence over automatic speed inference |
| Accuracy | Platform horizontal location uncertainty estimate, not guaranteed true error radius |
| Geocoding | Converting user-entered address/place to coordinates; currently delegated to platform geocoder |
| Map matching | Aligning noisy GPS points to a traversable network edge; not currently implemented |
| CRS | Coordinate Reference System; geographic points use WGS 84 here, with GeoJSON coordinate arrays ordered longitude, latitude |
| OSM tag | Key/value metadata attached to an OSM feature, e.g. `highway=footway`; coverage is crowd-sourced and incomplete |
| AQI | Jurisdiction-specific transformed air-quality index; not a pollutant concentration and not universally comparable |
| Spatial resolution | Ground area represented by a grid cell/map/support geometry, not the precision of the phone's GPS fix |
| Temporal validity | Time period a measurement/model forecast represents; separate from request/retrieval time |
| Exposure proxy | Declared route/time aggregation of an environmental estimate; not a personal inhaled dose or medical assessment |
| Stale | A cached/provider value older than the app's defined freshness policy or no longer valid for the requested time |
| Pareto candidate | A route that cannot be improved on one objective without worsening another among the compared candidates |
| SLA | Service-level agreement for availability/support; a public demo endpoint normally has none |
| Offline-first | Core local data operations work without a network; it does not imply offline map tiles or route computation |
| SQLCipher | SQLite-compatible database encryption extension; actual security depends on key lifecycle and native build configuration |
| Skill | On-demand agent instruction package; the created workspace Skills use VS Code Copilot Agent Skills format |

## Source Links

- [Implementation audit](./IMPLEMENTATION_AUDIT.md)
- [System architecture](./SYSTEM_ARCHITECTURE.md)
- [External data sources](./EXTERNAL_DATA_SOURCES.md)
- [Target architecture and roadmap](./TARGET_ARCHITECTURE_AND_ROADMAP.md)
