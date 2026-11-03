# Road Guide: AI Knowledge Base

Snapshot: 2026-11-03. This guide separates verified implementation from product intent and future recommendations. It is an engineering reference, not proof of a release-ready Android-native application.

## Start Here

- [Product and requirements](./PRODUCT_AND_REQUIREMENTS.md): intended value, audiences, current scope and product guardrails.
- [System architecture](./SYSTEM_ARCHITECTURE.md): repository structure, current dependencies and component/data-flow diagrams.
- [GPS, history and storage](./GPS_HISTORY_AND_STORAGE.md): capture lifecycle, classification, stop inference, SQLite and privacy.
- [Routing, GIS and OSM](./ROUTING_GIS_AND_OSM.md): current MapLibre/Valhalla path and suitable geospatial foundations.
- [Environmental intelligence](./ENVIRONMENTAL_INTELLIGENCE.md): current Open-Meteo data, evidence limits and a defensible exposure model.
- [Implementation audit](./IMPLEMENTATION_AUDIT.md): confirmed, partial, planned and reconsider decisions, with evidence and priorities.
- [UI/UX and testing](./UI_UX_AND_TESTING.md): actual screen ownership, accessibility and test coverage.
- [External sources](./EXTERNAL_DATA_SOURCES.md): primary references, costs/keys/licensing caveats and adoption guidance.
- [Target architecture and roadmap](./TARGET_ARCHITECTURE_AND_ROADMAP.md): approved Kazan MVP sequence RG-DEV-005–014 and acceptance gate.
- [Decisions, debt and glossary](./DECISIONS_TECH_DEBT_GLOSSARY.md): inferred decisions, risks and shared terminology.
- [Analyst and Developer workflow](./AGENT_WORKFLOW.md): proposed role boundaries, Copilot customization layout and the first Developer ticket.

## Evidence Rules

1. Treat executable source and tests as evidence of current behavior. A passing unit test confirms only its tested contract; it does not prove native background behavior on real devices.
2. Treat `RouteGuide_TZ.md` as the most current product/technical intent, not as implementation evidence. Earlier concept documents contain superseded proposals and unmeasured performance claims.
3. Label future recommendations as proposals. The Expo app under `src/` has no Kotlin/Compose/Room layer. A separate native scaffold exists in `native-android/`, but its Kotlin compile/debug APK have not succeeded; no Room database, cloud backend, ads SDK, on-device ML model, street-level exposure score or offline route graph is implemented.
4. Recheck provider coverage, terms, quotas, licenses and OS policies before release. Public endpoints and open data do not imply an SLA or unrestricted commercial use.

## Approved MVP Scope

The product owner selected Kazan, Republic of Tatarstan, Russia and Android/Kotlin/Compose/Room for the MVP target on 2026-11-03. The current checked-in app remains Expo/React Native; the native target is not implemented. See [approved MVP requirements](./PRODUCT_AND_REQUIREMENTS.md) and [RG-DEV-005–014 delivery plan](./TARGET_ARCHITECTURE_AND_ROADMAP.md). Provider access, the score formula, bus/car distinction and legacy-data migration remain validation/decision gates.

## Project-Specific Skills

Seven on-demand skills are in `.github/skills/` and use the VS Code Copilot Agent Skills format documented at [code.visualstudio.com/docs/copilot/customization/agent-skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills). This workspace has no installed Kilo Code extension or verified Kilo skill location; these files are not represented as Kilo-compatible.

- `gis-maps-geospatial-engineering`
- `routing-route-optimization`
- `environmental-intelligence`
- `android-kotlin-engineering`
- `ui-ux-visual-qa`
- `data-engineering-api-reliability`
- `software-testing-code-review`

The seven Skills provide shared on-demand domain procedures. The recommended separation of Analyst and Developer is by Custom Agent tool access, not by copying the Skills. No `.github/copilot-instructions.md`, `.github/agents/` or `.github/instructions/` exists yet; see [workflow proposal](./AGENT_WORKFLOW.md).

## Verification Snapshot

- `cd src && npm test`: 110 passed, 0 failed, 0 skipped across all 13 checked-in test files, per the RG-DEV-002 report.
- `cd src && npm run typecheck`: passed.
- The RG-DEV-001 route-group work and RG-DEV-002 test-gate work are reported complete. These are service tests with mocks and do not prove native Android OS behavior.
- RG-DEV-005 created the native Compose scaffold. Gradle configuration tasks passed, but `:app:compileDebugKotlin` and `assembleDebug` were terminated by external SIGTERM (exit 143); no APK was produced. The signal sender/reason is unknown; no Kotlin source error or cgroup OOM was reported.
- The four new root-level screen images were inspected as design references. Their locations, AQI and activity metrics are illustrative and are not confirmed MVP requirements/data.
- No successful native Kotlin compile/APK, Compose UI test, Pixel 9 run, Russian-network provider check or final MVP acceptance pass has been reported.

## Workspace State

The existing worktree already had changes in `.vscode/mcp.json`, `src/package-lock.json`, and an untracked `.mcp.json` at audit time. This research leaves those and all production code/configuration untouched.
