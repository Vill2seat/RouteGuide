---
name: android-kotlin-engineering
description: "Use when changing Android-specific behavior, Kotlin, coroutines/Flow, Compose, Room, background location, lifecycle, permissions, battery use, offline storage or Expo native modules for Road Guide."
---

# Android Architecture and Kotlin Engineering

## Goal

Use Android platform APIs within their lifecycle, permission and privacy constraints while preserving Road Guide's current cross-platform implementation unless an observed gap requires native code.

## Road Guide Baseline

Read [system architecture](../../../docs/ai/SYSTEM_ARCHITECTURE.md), [GPS/history/storage](../../../docs/ai/GPS_HISTORY_AND_STORAGE.md), [audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md) and [testing strategy](../../../docs/ai/UI_UX_AND_TESTING.md). The checked-in app is Expo/React Native. `src/app.json` and `src/app.config.js` declare location permissions/plugins; generated `android/` output is ignored. There is no checked-in Kotlin, Gradle module, Jetpack Compose, Room, WorkManager or Android instrumentation suite.

## Procedure

1. Confirm the request is truly Android-specific. Inspect `src/package.json`, Expo config, current plugin/module behavior and whether an Android generated project exists before proposing native code.
2. Reproduce the behavior on a supported Android version/device and state the OS/API level, permission state, battery mode and app lifecycle. Read official Android policy and SDK docs relevant to that exact API.
3. For background location, request foreground access in context, then background access only for a user-visible feature. Handle denial/revocation, approximate location, Android version-specific restrictions, foreground-service type/notification, Doze/OEM limits and app-store policy. Never promise uninterrupted delivery.
4. Keep capture work short and durable. Persist OS-delivered batches promptly, validate timestamp/coordinate/accuracy and tolerate duplicate/out-of-order callbacks. Make start/stop idempotent and cancellation-safe.
5. In Kotlin, use structured coroutine scopes and cancellation; expose stable `Flow`/suspend boundaries rather than launching unowned work. Use lifecycle-aware collectors for UI. Do not use WorkManager as a substitute for user-visible continuous location or a location foreground service.
6. Treat Compose/Room as future options, not current requirements. If introducing a native module, avoid a second competing source of truth next to Expo SQLite/SQLCipher. Define ownership, migration and cross-platform behavior first.
7. Preserve key material through Android Keystore-backed APIs. Inspect generated backup/manifest/configuration and test clean install, upgrade, backup/restore and key loss. Never log location, tokens or encryption keys.
8. Keep native changes represented in supported Expo config/plugins when generated folders are rebuilt. Do not hand-edit ignored generated code as the only source of truth.
9. Add unit tests for business logic, instrumentation tests for permissions/database/service boundaries, and real-device tests for background behavior, process death, Doze, network loss and vendor power management.
10. Run project typecheck and JS tests plus the relevant prebuild/native compile and device tests. A TypeScript-only check does not validate generated Android behavior.

## Architecture Guidance

- Prefer clear UI/data boundaries, repositories only where they improve testability, and one owner for each persisted entity.
- Keep location collection separate from route segmentation, environmental provider access and UI rendering.
- Treat every app background entry as a possible process recreation; recover active state from durable storage, not singleton memory.
- Keep offline history available independently from network routing/maps.
- Avoid replacing working cross-platform screens with Compose without a product or measured lifecycle justification.

## Validation Checklist

- Android minimum/target SDK and generated manifest are inspected.
- Permission request, denial, revocation and Settings return paths are covered.
- Background service type, notification behavior and OS constraints are tested on device.
- Coroutine cancellation and duplicate callbacks do not create duplicate jobs/routes.
- SQLCipher key/backup/delete lifecycle is verified in release build.
- No exact location appears in logs or unconsented requests.
- Expo prebuild reproducibly represents any native configuration.

## Primary References

- [Android background location](https://developer.android.com/develop/sensors-and-location/location/background)
- [Android architecture recommendations](https://developer.android.com/topic/architecture)
- [Kotlin coroutines](https://kotlinlang.org/docs/coroutines-overview.html)
- [Jetpack Compose](https://developer.android.com/develop/ui/compose)
- [Room](https://developer.android.com/training/data-storage/room)
