# Analyst and Developer Workflow

Status: proposed workflow for Road Guide, 2026-11-03. The owner has approved the Kazan native Android MVP. This document is documentation only; no Custom Agent or instruction file has been installed.

## Roles

### Analyst Agent

Owns research, architecture decisions, risk analysis, prioritization, technical specifications and independent review. Defaults to read-only work. It may edit only approved AI/project documentation and task specifications; it does not change `src/`, build files, dependencies or application algorithms.

For every recommendation, distinguish:

- **Verified:** source, test, provider specification or reproducible observation.
- **Partial:** some implementation/evidence exists but an important guarantee is missing.
- **Planned:** appears only in product/design documents.
- **Decision needed:** owner input or target-market evidence is missing.

Cite repository paths, methods, tests, official sources, applicable date, license/cost/key caveats and confidence. Do not state Kotlin/Android implementation, Russia availability, offline behavior, sensor accuracy or battery impact without direct evidence.

### Developer Agent

Implements one approved Developer ticket at a time. It chooses details inside the ticket's boundaries, checks current worktree changes first, changes only allowed production/test files, runs a focused check immediately after editing, and reports tests and unverified platform behavior. Scope changes, new dependencies, schema migrations, provider commitments and platform rewrites return to the Analyst/Product Owner for approval.

## Current Skills and Role Mapping

All seven existing workspace Skills are shared task knowledge, not separate role agents:

| Skill | Analyst use | Developer use |
|---|---|---|
| `gis-maps-geospatial-engineering` | Assess data/CRS/tag/coverage suitability | Implement geospatial adapters and geometry checks |
| `routing-route-optimization` | Compare providers, constraints and model designs | Implement route service/ranking changes |
| `environmental-intelligence` | Assess sources, accuracy and exposure claims | Implement validated environmental data/model contracts |
| `android-kotlin-engineering` | Review native Android feasibility, migration and lifecycle risks | Implement approved Kotlin/Compose/Room MVP tasks; the current Expo app remains a separate legacy/data source until transition is approved |
| `ui-ux-visual-qa` | Audit flows, states and screenshots | Implement approved UI and verify accessibility/visual states |
| `data-engineering-api-reliability` | Research provider contract, terms and data provenance | Implement adapters, parsing/cache/failure behavior |
| `software-testing-code-review` | Audit evidence, risks and acceptance criteria | Add focused tests and regression-safe changes |

Additional skills available to the current Copilot installation include Agent Customization and issue/PR workflows. They are not project architecture facts. A project-specific technical research skill may be useful for source freshness, licensing and Russia-market access checks, but the existing API/GIS/environmental Skills overlap substantially; create it only if repeated research demonstrates a gap.

## Copilot Customization Proposal

VS Code Copilot supports workspace Skills (`.github/skills/`), Custom Agents (`.github/agents/*.agent.md`), file instructions (`.github/instructions/*.instructions.md`) and shared instructions (`.github/copilot-instructions.md`). The repo currently has only the Skills directory. Prefer distinct role agents plus concise shared facts over making every rule an always-on global instruction.

Proposed structure, pending owner approval:

1. `.github/copilot-instructions.md`: short shared facts only: approved Kazan Android/Kotlin MVP target; current checked-in Expo/TypeScript baseline is legacy/current implementation rather than native MVP; source-of-truth links, privacy/evidence guardrails and current test commands.
2. `.github/agents/road-guide-analyst.agent.md`: read/search tools only where supported; no edit/execute tools. Output fact/partial/planned/decision-needed audit, decisions, risks and Developer tickets. External research tools should be configured only if actually available in that Copilot installation.
3. `.github/agents/road-guide-developer.agent.md`: read/search/edit/execute tools; implement only an approved ticket; preserve unrelated changes; run scoped tests and report. This agent does not choose product direction or add dependencies/platforms without approval.
4. `.github/instructions/road-guide-expo-legacy.instructions.md`: `applyTo` only `src/**/*.ts` and `src/**/*.tsx`; preserve current Expo app and user data, do not silently expand the legacy app as native MVP.
5. `.github/instructions/road-guide-kotlin-android.instructions.md`: `applyTo` only native Kotlin/Gradle/Compose files; Room ownership, encryption/migration, Pixel 9 test requirements and Android lifecycle/privacy constraints.
6. `.github/instructions/road-guide-documentation.instructions.md`: `applyTo` only project Markdown; evidence labels, no duplicate docs, links and approved MVP baseline.
7. Keep existing Skills on-demand. Do not copy their domain material into every instruction file.

This proposal does not add customizations yet because the owner asked to save the MVP scope and establish the delivery roadmap first. The VS Code Agent Skills format is confirmed; Kilo Code compatibility is not claimed.

## Review and Delivery Cadence

- One initial read-only audit before a major stage and one final read-only audit after the stage. Do not request a separate full audit after each subtask.
- Between audits, use the ticket's focused tests, typecheck, diff review and device checks appropriate to risk.
- Analyst creates the goal, baseline evidence, scope, restrictions, dependencies, risks, tests and acceptance criteria. Product owner approves the direction and ticket.
- Developer implements one cohesive ticket. If investigation reveals a new architectural decision, stop at that boundary and report; do not silently broaden the ticket.
- Analyst performs the final read-only review against acceptance criteria after the stage is complete.

## Developer Ticket Template

Every ticket must contain:

- **ID and title**
- **Context/problem:** observed behavior and evidence paths/tests
- **Goal:** one observable result
- **Allowed changes:** exact files/modules and whether tests/docs may change
- **Restrictions:** explicit non-goals (dependencies, schema, APIs, platforms, unrelated cleanup)
- **Implementation requirements:** externally visible behavior/contracts, leaving internal details to Developer
- **Test scenarios:** normal, boundary, failure, race/privacy as applicable
- **Acceptance criteria:** objective pass/fail conditions
- **Dependencies and risks**
- **Report format:** files changed, behavior, commands/results, device/API checks, known gaps

## Completed Ticket Reference: RG-DEV-001

RG-DEV-001 is reported complete. The ticket below is retained as historical acceptance context; it is not the next work item. RG-DEV-002 is also reported complete. The next MVP ticket is RG-DEV-005 in the [delivery roadmap](./TARGET_ARCHITECTURE_AND_ROADMAP.md), after its T0 feasibility/data/migration gates.

### Title

Correct route alternative group ownership and stale-response handling.

### Context and Problem

`src/services/routeService.ts` stores candidates in a module-level singleton. `getRouteCandidateGroupById(id)` filters by the candidate's own ID and therefore returns only one option, not the alternatives from the same search. `getRouteRecommendations()` assigns a successful response before checking whether its request is still current; an older request may overwrite or clear newer candidates. `src/app/route/[id].tsx` uses the group to determine whether the selected option is fastest, so the current defect can produce a false fastest label. This is corroborated by the source-level behavior; route service concurrency is not covered by the normal test suite.

### Goal

Ensure each planned route detail and comparison lookup refers to the complete candidate set from that route search, and only the active request can publish active candidate state. A saved route without its original group must not be described as fastest by inference.

### Allowed Changes

- `src/services/routeService.ts`
- `src/app/route/[id].tsx` only as needed for a neutral saved/unknown comparison state
- `src/services/routeService.test.cjs` or one focused route-service test file
- `docs/ai/IMPLEMENTATION_AUDIT.md` only if behavior/evidence changes after implementation

### Restrictions

- Do not change routing provider, endpoint, request payload, route algorithm, DB schema, bookmark format, dependencies or build configuration.
- Do not add environmental ranking, Kotlin/Compose, a backend, offline routing or unrelated cleanup.
- Preserve the existing Expo/TypeScript architecture and public route-planner behavior.
- Do not claim a saved singleton is fastest unless its comparison group is available.

### Implementation Requirements

- Associate candidates with an explicit request/group identity, or an equivalently safe design.
- Guard successful writes and cleanup against stale request completion.
- Ensure group lookup returns exactly the alternatives from the same search, not all candidates from unrelated searches.
- Keep standalone bookmarked candidate behavior honest when its original group is absent.
- Preserve request validation, geometry parsing and existing endpoint semantics.

### Test Scenarios

1. A route candidate resolves to all and only members of its own group.
2. New request succeeds before old request; old success cannot replace current state.
3. New request succeeds before old request fails; old cleanup cannot clear current state.
4. Detail identifies fastest only when the complete group establishes that comparison.
5. A saved route without its group displays a neutral saved/standalone state.
6. Existing coordinate validation and saved-route parsing remain green.

### Acceptance Criteria

- Active candidate state always belongs to the newest valid request.
- Group lookup and fastest labeling are correct for each request group.
- No public API/schema/provider behavior changes.
- Focused tests are deterministic and complete without timing sleeps.
- `cd src && npm run typecheck` and the focused route tests pass; report the standard suite result if run.

### Dependencies and Risks

No dependency. Risks are module cache consumers and saved bookmarks that lack group metadata. Do not introduce a DB migration to solve this ticket; use a neutral state for saved standalones.

### Developer Report

List modified files, explain request/group identity and stale-response handling, provide exact commands and pass/fail counts, state whether a device/network test was run, and list remaining limitations. Do not claim route environmental quality was improved.
