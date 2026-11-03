# Product and Requirements

## Product Understanding

Road Guide is a local-first mobility companion. Its near-term working product is a private movement diary with a daily map/timeline and a pedestrian route comparator. The long-term product goal is to help a person compare routes by time, distance and well-supported environmental conditions, while exposing uncertainty rather than presenting a black-box health judgment.

The meaningful product distinction is not “GPS recording plus a green line.” It is explainable choice under incomplete environmental evidence: what changed between routes, which data supports that comparison, where and when those data apply, and what remains unknown.

## Users and Main Jobs

- Urban pedestrians and cyclists who want a useful, private record of their trips.
- People comparing two plausible ways to reach a destination, once route-level environmental data is available.
- Users who need to pause tracking, correct a mode, rename a visit, export their data or delete it.

Main flow in the current app: create an on-device display profile, grant foreground location, optionally grant background location, record GPS points, review the local day/history, correct transport labels, and request walking alternatives by entering endpoints.

## Product Guardrails

- Do not claim a route is cleaner, quieter, safer or medically better without route-specific evidence and a documented method.
- Do not treat model output, a city-grid value or a road-class proxy as a street measurement.
- Display measurement/model source, valid time, spatial scale, staleness and missing-data state alongside an environmental value.
- Do not equate transport classification confidence with a calibrated probability until it has been calibrated against representative labeled trips.
- Keep local history usable without an account. Any future sync or telemetry needs a separate privacy decision and clear consent.
- Background location depends on OS permissions, scheduling, device policies and signal. No “always-on,” battery-percentage or uninterrupted-history guarantee is justified by the code.

## Current, Evidence-Based Scope

Present in source: Expo/React Native screens; foreground/background GPS capture attempt; local route history and derived stop events; manual transport/place corrections; MapLibre map; Valhalla pedestrian alternatives; fastest-duration selection; modelled city-level PM2.5/weather display; local encrypted SQLite storage, export and deletion. See [implementation audit](./IMPLEMENTATION_AUDIT.md).

Not present: multi-factor route scoring, route-segment environmental joins, measured street noise, full pollutant panel, activity-recognition API, ML classification, cloud identity/sync, analytics/ads, city-wide learned patterns, offline maps or offline route search.

## Approved MVP Baseline

Status: product scope supplied and selected by the owner on 2026-11-03. This is an approved target, not a claim that the current repository implements it.

- **Pilot:** Kazan, Republic of Tatarstan, Russian Federation.
- **Target platform/stack:** Android, Kotlin, Jetpack Compose, Room.
- **Maps/geodata:** OpenStreetMap data with attribution; OSM/Overpass for bounded geospatial queries or prepared local data.
- **Routing:** evaluate Valhalla and OSRM for Kazan; no provider is selected for production until coverage and access from the target network are checked.
- **Weather/air:** Open-Meteo and Copernicus CAMS are candidates. Verify Kazan coverage, temporal and spatial resolution, legal/commercial terms, quotas and reachability from Russia before implementation.
- **Target device:** Pixel 9; no build or runtime validation on that device has yet been reported.

## MVP User Flow and Capabilities

1. **Home:** open a map, locate the user and start a trip.
2. **Active trip:** display the map, elapsed time, distance and current activity while recording.
3. **Analysis:** after the trip, show an Exposure Score from 0 to 100, weather, available pollutant values, data coverage/completeness percentage and an explanation of contributing factors.
4. **History:** list completed trips and their analysis results; open each saved route on the map.
5. **Alternative route:** offer a route with more favorable supported environmental conditions. This is the final feature stage, after source validation and score calculation.

Required MVP behavior includes GPS route recording, OpenStreetMap display, saving and viewing completed trips, time/activity segmentation, weather, available PM2.5/PM10/NO2/O3 and other pollutant fields, GIS context for roads/industrial/green areas, explainable score and data-coverage indicator, and an alternative route.

### Activity Scope

The requested labels are walking, running, car and bus. Custom machine learning and universal transport recognition are excluded. Before implementation, verify whether Android system activity signals and available Kazan transit data can distinguish car from bus. If evidence cannot support that distinction, represent the result as motorized/unknown and allow a manual correction; do not fabricate certainty or silently claim the car/bus requirement is met.

### Score and Data-Quality Semantics

The score must be deterministic and explainable, not an individual inhaled-dose or medical estimate. The meaning and direction of the 0–100 scale must be agreed before implementation: the product goal suggests that a higher score means a more favorable route, but the phrase “Exposure Score” can imply the reverse. The displayed coverage percentage represents completeness/freshness of available evidence, not a calibrated statistical probability. Missing, stale, unsupported or coarse data must remain visible and cannot become zero exposure.

Environmental observations must retain metric, unit, source, retrieved and valid time, spatial support/resolution, method/model version and quality state. Time spent in different conditions is considered by route segments; no environmental provider value is a curbside measurement unless its source explicitly establishes that.

## MVP Acceptance Criteria

The MVP is complete only when a user can:

1. Open the map and see the current location, subject to granted permission.
2. Start a trip recording session.
3. Move while valid GPS points are recorded with timestamp and quality metadata.
4. Stop and save the trip locally.
5. View the saved route on the OSM-based map.
6. See environmental data aligned to the trip's time/segments, with missing/stale states disclosed.
7. Receive an Exposure Score from 0 to 100 using the approved, versioned method.
8. See the factor explanation and evidence-coverage percentage.
9. Open prior trips and their results from history.
10. Request and view an alternative route ranked by supported environmental conditions.

## Explicit MVP Exclusions

- Custom machine-learning classifier, social functions, accounts/cloud synchronization, Apple Watch/Wear OS, universal transport recognition, microphone-based noise measurement, complex personalization, a complete Google Timeline clone, and detailed personal pollutant dose.
- No health/medical benefit claim and no unsupported “cleaner” or “safer” promise.
- Offline route computation is not part of this MVP unless separately approved; local history should remain available without a network where the chosen native design permits it.

## Current Repository and Migration Constraint

The existing application under `src/` remains Expo/React Native/TypeScript with Expo SQLite/SQLCipher, MapLibre React Native, Valhalla pedestrian/bicycle requests and area-level Open-Meteo display. A separate `native-android/` Kotlin/Compose scaffold has now been created for RG-DEV-005, with the four MVP screen shells and a navigation test source. Gradle configuration tasks pass, but `:app:compileDebugKotlin` was terminated by an external SIGTERM; no APK or successful Kotlin compilation is confirmed. Room is not implemented yet.

Room is not encryption by itself. The native storage task must define an encryption/key strategy and a safe policy for existing encrypted Expo history. No legacy database may be deleted or overwritten before compatibility, migration/export path and backup behavior are verified. Resolve whether the current app has user data that must be migrated and whether an install-over upgrade with the existing application ID/signing key is required.

## Remaining Product/Technical Decisions

- Verify weather, air, OSM/Overpass and routing coverage/terms/network access for Kazan and Russia.
- Agree score direction, normalization, pollutant weighting, missing-data behavior and coverage-percentage formula.
- Verify car-versus-bus distinction without custom ML and availability of usable Kazan transit data.
- Choose time alignment/acquisition for weather and air data during trips, including API request cadence and cache policy.
- Agree legacy Expo-history migration, Room encryption/key handling, application ID and signing continuity.
- Decide acceptable route alternatives and profiles for walking/running/car/bus; transit routing may require separately licensed or available timetable data.

## Source of Truth

This approved MVP scope is the product baseline. [Implementation audit](./IMPLEMENTATION_AUDIT.md) and [system architecture](./SYSTEM_ARCHITECTURE.md) describe the current repository, not the target implementation. [MVP roadmap](./TARGET_ARCHITECTURE_AND_ROADMAP.md) defines the migration and delivery sequence. Earlier [Features.md](../../Features.md), [Functionality_Analysis.md](../../Functionality_Analysis.md), [Architecture.md](../../Architecture.md), [Screen_Guides.md](../../Screen_Guides.md), [Technical_Requirements.md](../../Technical_Requirements.md) and [Google_Ads_Integration.md](../../Google_Ads_Integration.md) remain unverified concept material unless explicitly included above.
