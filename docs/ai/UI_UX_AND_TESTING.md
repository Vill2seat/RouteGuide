# UI/UX and Testing

## Current Screens and Interaction

| Screen/component | What exists | Not present / avoid claiming |
|---|---|---|
| `app/onboarding.tsx` | Four-step local profile/privacy/location explanation; foreground permission request | No guest-without-location flow; no immediate background “Always” prompt |
| `app/index.tsx` | Today map, local metrics/timeline, recording state, area conditions and retry | No environmental route score or traffic view |
| `app/history.tsx` | Local calendar, selected day map, date navigation, timeline scroll/date retained in module state | No all-time analytics or playback scrubber |
| `app/tracking.tsx` | Recording status, start/stop, route mode cycle | Not a sensor-recognition configuration screen |
| `app/route-planner.tsx` | Address/current location, disclosure checkbox, pedestrian candidates, fastest recommendation and saved routes | No fastest/cleanest/shortest filters or exposure comparison |
| `app/route/[id].tsx` | Recorded/planned route detail, bookmarks, external maps handoff | No turn-by-turn navigation; route-line geometry is recalculated by the external app |
| `app/settings.tsx` | Recording/background/notification permissions, local profile, JSON export, diagnostic export/clear, deletion | No account, sync, ad preference, cloud settings |
| `RouteMap.tsx` | MapLibre map, route line, visit and current-location markers, weather directions, map-error overlay | No route heatmap, noise/pollution layer or offline tile pack |
| `DayTimeline.tsx`, `VisitSheet.tsx` | Derived trip/stop events, transport edits and visit labels | Stops are heuristics, not an address/POI classifier |

Bottom navigation includes Today/map, History and Routes. Settings is reached from Today. Screen-level state uses React hooks and Expo Router; history date/scroll and selected route are ordinary in-memory module state, not persistent application state.

## Reference Images

`docs/design/references/` contains four visual references: a map plus day timeline, a red route poster, a route with numbered stops, and a green route poster. They illustrate chronology, map geometry and contrasting route treatments. They are not pixel-level specifications, do not prove a route-quality score, and should not be copied as evidence that the current UI includes those features. The SVG icon sprite and IDs are documented in `docs/design/icons/README.md`; the runtime imports individual SVG files from `src/assets/icons/`.
`docs/design/references/` contains four visual references: a map plus day timeline, a red route poster, a route with numbered stops, and a green route poster. They illustrate chronology, map geometry and contrasting route treatments. The structured [Figma implementation contract](../design/figma/check) adds five static screens (S01 Today, S02 History, S03 Compare, S04 RouteFast and S05 RouteQuiet), target actions, state rules, motion and acceptance scenarios. It explicitly distinguishes existing mockups from specification-only and required-but-undrawn states.

The Figma contract's route addresses (`/today`, `/routes/compare`, `/routes/:routeId`) do not match Expo Router's current `/`, `/route-planner` and `/route/[id]` paths. Its demo day and route values (including example 68/49 dB and PM2.5 24/12 µg/m³) are explicitly illustrative, not provider measurements or current app output. S05's quiet-route distinction and turn-by-turn guidance are not implemented; the current detail screen hands off to an external map app. Do not copy demo values into runtime data or treat the visual states as implemented behavior.

The SVG icon sprite and IDs are documented in `docs/design/icons/README.md`; the runtime imports individual SVG files from `src/assets/icons/`.

## Approved MVP Screens and Supplied Images

The owner supplied four additional root-level images for MVP direction:

- [Главный экран: карта, GPS, начало прогулки](../../Главный%20экран%20Карта,%20GPS,%20начало%20прогулки..jpeg)
- [Активный маршрут: карта, время, расстояние, активность](../../Активный%20маршрут%20Карта,%20время,%20расстояние,%20активность..jpeg)
- [Анализ маршрута: Exposure Score, погода, загрязнение, достоверность](../../Анализ%20маршрута%20Exposure%20Score,%20погода,%20загрязнение,%20достоверность..jpeg)
- [История маршрутов и результаты](../../История%20Список%20маршрутов%20и%20их%20результаты..jpeg)

They align with the approved Home, Active Route, Analysis and History screens. Treat them as visual references, not verified data or exact Figma contracts. The supplied analysis image shows a San Francisco location, AQI and pollutant values, while other images include third-party branding, elevation, calories, heart rate, ratings or activities outside this MVP. Do not copy those values/features into Kazan product output. Actual MVP values must come from the approved provider/model and display source, valid time, coverage and uncertainty.

## UX and Accessibility Checks for Future Work

- Preserve explicit states: recording active in background / foreground / unavailable / paused; empty history; no GPS fix; denied permission; map/provider unavailable; no route; missing or stale environmental value.
- Do not use green/red alone for exposure. Pair route distinction with labels, symbols, factor text and accessible descriptions.
- Keep disclosure adjacent to the action that sends exact coordinates. Explain which provider receives which data.
- Treat users' location/history as sensitive. Never place coordinates in accessibility labels, diagnostics, screenshots or analytics.
- Verify font scaling, screen reader order, touch target size, contrast, keyboard behavior and reduced-motion behavior on small Android and iOS devices.
- Use real screenshots from a running build for visual QA; distinguish provided design images from app captures. A model/tool must actually support image input before claiming it analyzed a screenshot. In this session the reference images were viewable, but no running-app screenshot was captured.
- Current `useReducedMotion` honors the system setting; check animation and state transitions with motion reduction enabled.
- The local Figma text contract and four legacy reference images were inspected. The PDF and internal `canvas.fig` layer structure were not rendered/read: no PDF extraction/viewer tool was installed, and no external component was added. Exact layer geometry and 1:1 visual comparison remain unverified.

## Test Inventory

`src/package.json` standard `npm test` invokes Node `node:test` against all 13 checked-in `*.test.cjs` files: transport classifier, route recommendation, route service, database, location service, day timeline, city conditions, database race, location-service race, map coordinate validation, route coordinate validation, stop recording and `route_guide_analysis.test.cjs`. Keep this explicit list in sync with the test files and run it from `src/` with `npm test`.

The race tests use deferred promises/barriers to control operation order rather than elapsed-time sleeps. Stop-recording tests assert the production promise rejection and resulting route, preference and location-service state. Coordinate-validation tests exercise the production `assertCoordinate` function; they do not render MapLibre. Most service tests transpile TypeScript in a Node VM and mock native modules. No React Native component test, Expo integration test, Android instrumentation test, Compose test, iOS test, screenshot baseline or real-device test infrastructure is present in `package.json`.

## Test Results from This Audit

- `cd src && npm test`: 110 passed, 0 failed, 0 skipped across all 13 checked-in test files.
- `cd src && npm run typecheck`: passed.
- Race and stop-recording tests specifically cover parallel initialization/start-stop ordering and propagated failures; these are mock-based service tests, not proofs of native OS behavior.
- Native Compose navigation test source exists under `native-android/`, but Kotlin compilation was terminated by an external SIGTERM; the test and app were not run.

Native build was attempted for RG-DEV-005: Gradle configuration passed, but `:app:compileDebugKotlin`/`assembleDebug` ended via external SIGTERM (143), and no APK was produced. The sender is unknown; no compiler error or cgroup OOM was reported. Pixel 9/device, Compose UI and final MVP tests remain pending. The initial `npm audit` was not run. The textual Figma contract and supplied references were inspected; PDF and `.fig` layer data remain unverified.

## Recommended Validation Pyramid

1. Pure unit tests for deterministic calculations: speed classification, GPS filtering, stop thresholds, local dates, route ranking and exposure aggregation.
2. Service contract tests with mocked provider responses: timeout, invalid payload, partial failure, stale cache, out-of-order requests and cancellation.
3. SQLite integration tests against the actual SQLCipher-enabled native build: migrations, transaction behavior, key reset, backup/restore and delete/export.
4. Native device tests: permission grant/revocation, background/foreground transitions, process death/force-stop, OS batching, Doze, vendor battery policies, poor signal and clock/time-zone changes.
5. UI journey and screenshot checks: onboarding/permission denial, record-pause-resume, empty/populated history, manual correction, route failure, missing/stale environment data and deletion confirmation.
6. Privacy regression checks: no precise GPS in logs/network other than consented route endpoint calls; verify provider requests, export content and local deletion.

For every future change: identify the owning service/screen, add the smallest behavior-level test, run the focused test first, then `npm test` and `npm run typecheck` when impact warrants them. Native provider or privacy changes require the device/network checks above; a TypeScript pass alone is not sufficient.
