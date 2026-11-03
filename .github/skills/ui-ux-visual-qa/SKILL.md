---
name: ui-ux-visual-qa
description: "Use when designing or reviewing Road Guide mobile UX, maps, environmental route comparisons, accessibility, loading/error/empty states, screenshots, visual regression or React Native/Compose UI tests."
---

# UI/UX and Visual Quality Assurance

## Goal

Make map/history/routing workflows legible, accessible and honest about uncertainty. Verify actual running UI separately from design references and code inspection.

## Road Guide Baseline

Read [UI/UX and testing](../../../docs/ai/UI_UX_AND_TESTING.md), [product requirements](../../../docs/ai/PRODUCT_AND_REQUIREMENTS.md), [system architecture](../../../docs/ai/SYSTEM_ARCHITECTURE.md) and [implementation audit](../../../docs/ai/IMPLEMENTATION_AUDIT.md). Current screens use Expo Router and React Native; maps use MapLibre. Design references live in `docs/design/references/`. There is no Compose UI, automated screenshot baseline or UI test dependency in the checked-in project.

## Procedure

1. Identify the user task and current owning screen/component. Read its implementation and nearby navigation/data states before changing layout.
2. Separate design assets from app captures. A supplied reference image is not evidence that the current app renders that feature. Capture the running app on a real/supported simulator when visual verification is required.
3. Check whether the active model/tool actually accepts images before promising visual inspection. Use an image-capable view tool or human review; do not infer image support from the model name. If no visual input is available, state that only source/layout inspection was performed.
4. Check the complete workflow: initial/permission denied, loading, success, empty, stale data, partial provider failure, network loss, permission revoked, saving/error and delete confirmation.
5. For route/environment comparison, show time/distance and evidence/unknowns in text. Never rely on red/green alone or label a route clean/quiet without evidence. Keep map legends and screen-reader labels aligned with visible layers.
6. Validate map framing and geometry at small/large screens, landscape where supported, safe areas, font scaling and screen reader order. Ensure overlays do not cover the route, controls or critical map attribution.
7. Check keyboard behavior for address/profile inputs; touch targets, contrast and focus state; reduced-motion behavior; localization length and numeric/date formatting.
8. For visual regression, store deterministic fixtures and screenshots with viewport/device/OS metadata. Avoid comparing dynamic map tiles unless they are controlled or masked; test overlays/route GeoJSON independently.
9. Prefer focused component/workflow tests for state logic. Use device/simulator screenshots for native map and permission surfaces that mocks cannot exercise.
10. Report observations with screen/state, reproduction steps and severity. Distinguish confirmed visual defects from assumptions about provider data or inaccessible screenshots.

## Validation Checklist

- Actual app screenshot and device/viewport are identified.
- Image input capability is confirmed for the current tool/model before visual claims.
- Permission, loading, empty, stale, offline and error states are present and coherent.
- Environmental numbers include source/age/scale and are not mistaken for route-level measurement.
- Color has a text/icon/shape alternative.
- Map attribution, labels, controls and route are not obscured.
- System font scaling, screen readers, touch targets, keyboard and reduced motion are checked.
- Visual regression excludes uncontrolled network-tile noise.

## References

- [React Native accessibility](https://reactnative.dev/docs/accessibility)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [MapLibre React Native](https://maplibre.org/maplibre-react-native/docs/)
- [Jetpack Compose testing](https://developer.android.com/develop/ui/compose/testing) (future only; not current UI)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
