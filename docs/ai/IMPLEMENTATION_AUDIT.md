# Implementation Audit

Snapshot of checked-in code on 2026-11-03. Status labels describe repository evidence, not product quality or app-store readiness.

## A. Implemented and Confirmed

| Capability | Evidence and tests |
|---|---|
| Expo/React Native app with file-based navigation | `src/package.json`, `src/app/_layout.tsx`, screens in `src/app/` |
| Foreground location watcher and background TaskManager path with foreground fallback | `src/services/locationService.ts`; mocked behavior in `locationService.test.cjs` |
| GPS storage, local active route, timestamp/coordinate filtering, distance/time summaries | `src/services/database.ts`; `database.test.cjs` |
| SQLCipher setup, SecureStore key, legacy plaintext DB migration and count verification | `src/services/database.ts`; migration test in `database.test.cjs` |
| Local-day map/timeline, heuristic trip and stop derivation, visit labels and transport overrides | `src/services/dayTimeline.ts`, `src/app/index.tsx`, `src/app/history.tsx`; `dayTimeline.test.cjs` |
| Speed-only walk/bike/motorized classification and manual override | `src/services/transportClassifier.ts`, `database.ts`; classifier tests |
| MapLibre Native with configurable OpenFreeMap style and OSM attribution | `src/components/RouteMap.tsx`, `src/services/mapProvider.ts` |
| Pedestrian and bicycle route retrieval with up to two alternatives from Valhalla | `src/services/routeService.ts`; current tests verify profile payload and candidates |
| Fastest-duration recommendation per current candidate group | `src/services/routeRecommendation.ts`, `src/components/RouteOptionCard.tsx`; environmental ranking is still absent |
| Rounded-coordinate city PM2.5/weather retrieval, bounded in-memory cache and stale/missing states | `src/services/cityConditions.ts`; `cityConditions.test.cjs` |
| Local profile, export, diagnostic log cap, history deletion and local-data deletion | `src/services/database.ts`, `src/app/settings.tsx`; partial DB tests |

Per the RG-DEV-002 completion report, `cd src && npm test` ran 110 tests across all 13 checked-in test files with 0 failures/skips; `cd src && npm run typecheck` passed. These checks are mostly mocked logic tests, not native/device validation. The current worktree contains additional developer changes; do not infer a final state beyond the reported commands without rerunning them.

## B. Implemented Partially

| Area | Evidence / missing behavior | Product consequence |
|---|---|---|
| Background location | 30-second high-accuracy request, background TaskManager and foreground fallback exist; system/device can delay or stop callbacks; no field/battery evidence | A recorded timeline may have gaps; do not promise continuous history |
| Mode recognition | Speed thresholds classify walking/cycling/motorized only; no bus/train/car separation, sensor fusion or calibrated confidence | UI offers modes unavailable to automatic detection; user correction is essential |
| Stop/trip timeline | Derived heuristics exist, but no persistent trip/stop segmentation or revision/provenance record | Recalculation changes may alter historical visit boundaries |
| Route alternatives | Valhalla pedestrian and bicycle profiles; up to three candidates; current-request group held in memory | Network/provider fragility; external map handoff in the current modified detail screen still uses walking mode |
| Environmental data | Area-level modelled PM2.5 and current weather are retrieved and disclosed; no route geometry join or historical exposure | Useful context only; cannot support “cleaner route” claim |
| Offline | Local history and saved routes survive network loss; map tiles and new route queries depend on providers; city-condition cache is process memory | Offline mode is limited, not the broader design-doc promise |
| Data security | SQLCipher and a SecureStore-held key are implemented, but native build/backup lifecycle and device compromise have not been independently verified | Do not describe this as an audited security guarantee |
| Data migration | Count checks exist before deleting plaintext database; no row-by-row hash/equivalence validation | A same-count migration defect could escape the check |

## C. Planned or Mentioned Only

- Route-level Exposure Score, route segment joins, pollutant panel beyond PM2.5, AQI normalization and confidence intervals.
- Environmental/noise/traffic-aware route ranking, the 5-minute bonus, configurable weights, health/scenic route categories.
- Measured noise data, continuous traffic, industrial emissions matching, quantified vegetation/canopy.
- OSMnx-derived production graph, Overpass-backed production queries, offline map/routing packages and spatial DB extension.
- ML/TensorFlow Lite or Core ML transport classifier; activity-recognition and accelerometer/gyroscope fusion.
- Native Kotlin/Compose architecture, Room, WorkManager-based ingestion, native Android-specific domain layer.
- Account, cloud sync, Firebase/Supabase backend, push, analytics, AdMob/other monetization and Health Connect/HealthKit.
- Home/work inference, calorie estimates, streaks, route playback, multi-year analytics and community maps.

Evidence: these appear in older concept/specification docs, but there is no corresponding dependency or implementation in the Expo app under `src/`. A separate Kotlin/Compose scaffold now exists in `native-android/`; its Gradle configuration task passes, but Kotlin compile and APK assembly are blocked by external SIGTERM. Room, location, environmental data and native MVP behavior remain unimplemented/unverified there.

## D. Requires Review

### D1. Candidate-group race and fastest-label bug — reported resolved

RG-DEV-001 is reported complete. The current worktree source includes a request-scoped candidate group, stale-response guards and neutral comparison when the original group is absent; the updated route tests exercise group membership and out-of-order success/failure. This audit records the supplied completion status, not an independent fresh test run. The group remains in memory, so a saved route without its original group intentionally has unknown comparison status.

### D2. Route ranking is fastest-only despite the product direction

**Priority:** High before environmental recommendations; not a current correctness bug because the UI discloses the limitation. **Evidence:** `recommendRouteIndex()` reads only `durationMinutes`; `route-planner.tsx` says city conditions do not rank streets; route cards/detail show unavailable PM2.5/noise. Tests `routeRecommendation.test.cjs` explicitly assert fastest-only behavior.

**Impact:** The key long-term differentiator is absent. **Recommendation:** first define a provenance/uncertainty contract and segment-level pilot; only then add deterministic scoring behind a versioned domain function. **Dependencies:** selected city, route provider, environmental coverage, validation dataset. **Risk:** false precision, unstable scores and route-access regressions if weights are added prematurely.

### D3. Third-party public endpoints are runtime dependencies without an SLA

**Priority:** High for public release, Medium during prototype. **Evidence:** default endpoints in `app.config.js`, `routeService.ts`, `cityConditions.ts`, and `mapProvider.ts`; `src/README.md` documents public service/no-SLA and rate-limit caveats.

**Impact:** throttling, provider policy changes, privacy/log retention and availability are outside app control. **Recommendation:** select providers for a launch market; check terms, quotas and retention; add timeout/retry/cache observability and a provider interface; do not add a backend unless it solves a real secret/rate-limit/data-delivery problem. **Dependencies:** product geography, budget and license review. **Risk:** provider migration and operational cost.

### D4. Test coverage gate — reported resolved for service tests

RG-DEV-002 is reported complete: `npm test` includes all 13 checked-in `*.test.cjs` files and passes 110/110 with no skipped tests; race/stop/coordinate fixtures were made deterministic. Native device, Compose UI and real-provider integration tests remain absent, so the JS service gate is not an MVP acceptance gate for the selected Kotlin application.

### D5. Early design documents contradict the verified app and current privacy stance

**Priority:** Medium. **Evidence:** `Features.md`, `Functionality_Analysis.md`, `Architecture.md`, `Screen_Guides.md`, `Technical_Requirements.md` and `Google_Ads_Integration.md` describe unimplemented ML, Firebase, API choices, 90% accuracy, battery targets and route exposure. `RouteGuide_TZ.md` and `src/README.md` explicitly reject treating those as measurements/guarantees. The owner has now approved a separate Kazan Kotlin/Compose/Room MVP target; that does not make these older designs current implementation evidence.

**Impact:** Future work can implement stale assumptions or publish unsupported claims. **Recommendation:** treat this audit and current README as the implementation baseline; mark old documents archival/proposal status in a later documentation-only task. **Dependencies:** product owner approval for changing existing docs. **Risk:** editing historical references without product review.

### D6. UI orchestration is directly coupled to a singleton DB/service layer

**Priority:** Medium as environmental/domain complexity grows. **Evidence:** screens call `SQLiteDB` and provider services directly; no DI, repository/use-case boundary or UI test adapter. `screenState.ts` and route candidates keep mutable module state.

**Impact:** harder deterministic UI tests, provider replacement and concurrent request ownership. **Recommendation:** add narrow contracts around new environmental/routing behavior and extract only logic that needs isolation; keep existing local flows until a specific test seam is needed. **Dependencies:** route candidate correctness and future data contracts. **Risk:** broad refactor could destabilize capture/history.

### D7. Native Android scaffold build is blocked

**Priority:** Blocking for native MVP. **Evidence:** `native-android/` exists; Gradle configuration succeeds. RG-DEV-005-R1 reports `:app:compileDebugKotlin` and `assembleDebug` terminated by external SIGTERM, exit 143; no Kotlin compiler diagnostic, `OutOfMemoryError` or cgroup OOM. The daemon log does not reveal who sent SIGTERM. APK is absent; Compose UI test and device run were not performed.

**Impact:** the native MVP is not yet a buildable/installable application. The existing Expo app is unaffected. **Recommendation:** repeat the compile in an executor that does not terminate Gradle daemons and with 2–3 GB free memory; capture full daemon/process logs. Do not change Kotlin sources/toolchain without evidence of a source or compatibility defect. **Dependencies:** stable Codespace execution window and memory. **Risk:** another external termination can leave status inconclusive; SDK XML warning alone is not the diagnosed cause.

## Overall Assessment

The repository is a local tracking and pedestrian/bicycle route-comparison Expo app plus a separate unbuildable Kotlin/Compose scaffold. It is not yet the approved Kazan environmental-analysis MVP. The native transition is owner-directed, but native compilation is presently blocked by an unexplained external SIGTERM; do not treat RG-DEV-005 as accepted. Key gates remain Kazan/Russia source availability, score semantics, bus/car distinction and safe Room/encryption migration. RG-DEV-001/002 are reported complete; RG-DEV-005-R1 is blocked; later delivery remains RG-DEV-006–014 after a successful native foundation.
