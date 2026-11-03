---
name: software-testing-code-review
description: "Use when testing, reviewing, debugging or safely refactoring Road Guide code, including GPS races, SQLite migration, route ranking, provider failures, regression coverage and privacy-sensitive changes."
---

# Software Testing and Code Review

## Goal

Find behavior regressions at the owning boundary and verify the smallest useful contract. Keep findings evidence-based, preserve unrelated work and never confuse mocked tests with native/device proof.

## Road Guide Baseline

Read [UI/UX and testing](../../../docs/ai/UI_UX_AND_TESTING.md), [implementation audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md), [system architecture](../../../docs/ai/SYSTEM_ARCHITECTURE.md) and [GPS/storage](../../../docs/ai/GPS_HISTORY_AND_STORAGE.md). Current tests use Node `node:test`, TypeScript transpilation and VM mocks. `npm test` covers eight files; five other service tests are not included. No Android/iOS device, Compose or screenshot regression suite is checked in.

## Review Procedure

1. Establish scope and current worktree state. Do not revert or overwrite user changes. Read the owning function, direct caller and nearest test before suggesting edits.
2. Trace the data/control path from input through validation, mutation/persistence and UI output. For location/provider work, identify permission, lifecycle, request owner, cache and user disclosure.
3. State one falsifiable hypothesis and the cheapest behavior check that could disprove it before changing code.
4. Prioritize correctness/privacy/data loss/crash and user-visible misinformation. Cite concrete source and test evidence. Separate defects from product gaps and future recommendations.
5. Add or adapt a focused test at the narrowest boundary: pure function, service contract, DB integration, UI flow or native device test. Test error and race paths, not just happy path.
6. Run the focused check immediately after the edit, then typecheck/standard suite as warranted. Do not broaden scope to unrelated failing tests.
7. For location, test out-of-order/duplicate points, low accuracy, permission denial/revocation, background callbacks and duplicate start/stop. For SQLite, test transactions, migration, key loss, backup/delete and count/content parity. For APIs, test malformed/partial/stale/timeouts and overlapping requests.
8. Compare test files with package scripts. A file not invoked by CI/npm script is not part of the demonstrated green gate. Isolate hung/flaky tests and state unknown results honestly.
9. For refactors, preserve public contracts and user data. Use schema migrations, not DB deletion. Keep unrelated production behavior untouched.
10. Report review findings first, ordered by severity, with file references, impact, preconditions and missing tests. If no defect is found, say so and list meaningful test gaps.

## Road Guide Risk Checklist

- Exact GPS coordinates, route endpoints and third-party disclosure.
- Background permission vs foreground fallback semantics.
- In-memory singleton state and concurrent route requests.
- SQLCipher key lifecycle and plaintext migration safety.
- Local-day/time-zone boundaries and timestamp ordering.
- Missing/stale environmental data incorrectly ranked as zero.
- Road/green proxies mislabeled as pollutant/noise measurements.
- Unvalidated battery, accuracy, classifier or “percent cleaner” claims.
- Provider no-SLA behavior and offline user-visible states.

## Validation Checklist

- Test exercises actual production helper/service, not a copied implementation.
- Assertions represent the intended current error contract.
- Async tests deterministically control promise order and always settle/cleanup.
- Native behavior is validated on platform devices when mocks cannot prove it.
- Standard command list includes maintained tests or documents why not.
- Review leaves user modifications and unrelated files untouched.

## References

- [Node.js test runner](https://nodejs.org/api/test.html)
- [Android testing fundamentals](https://developer.android.com/training/testing/fundamentals)
- [Expo testing overview](https://docs.expo.dev/develop/unit-testing/)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [Android background location](https://developer.android.com/develop/sensors-and-location/location/background)
