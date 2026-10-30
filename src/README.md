# Route Guide MVP

## Local development

```sh
npm ci
npm run typecheck
npm test
npx expo install --check
npx expo start
```

After onboarding and location permission, automatic route recording starts by
default and GPS points are encrypted on-device. The Today and History screens
derive a local calendar-day timeline from those points, detect likely stops,
and allow a user to label places and correct transport for a trip interval.
The speed-based classifier distinguishes walking, cycling, and generic
motorized movement; it cannot reliably identify cars, buses, trains, or
motorcycles. Manual corrections are stored with the GPS points.

Location sampling uses balanced accuracy with a 50 m / 60 s minimum interval;
the background task can defer batches, and iOS may pause updates while
stationary. This reduces unnecessary work but cannot guarantee zero battery
use or uninterrupted collection. The operating system, permissions, device
settings, signal, and force-stop behavior remain authoritative.

The route planner compares pedestrian routes by duration and distance and
selects the fastest by default. City-wide air/weather values are not used to
claim that a particular street is cleaner or to rank route alternatives.
Noise analysis and live traffic are not enabled. The city conditions card uses
Open-Meteo modelled PM2.5 and current weather for coordinates rounded to about
11 km; values are not street-level measurements. Traffic is shown as
unavailable until a suitable provider is selected.

The mobile screens follow the five-screen design in
`docs/design/figma/Untitled.pdf`: a live local day map, calendar-based history,
pedestrian route comparison, and route details. History dates and scroll
position, and the selected comparison option, are retained while switching
tabs during the current app session. Saved route bookmarks are stored on-device.
Unbookmarked route alternatives are kept only in session memory. Route details
show noise and street-level PM2.5 as unavailable; they never reuse city-level
Open-Meteo values as route measurements or label an unverified alternative as
quiet or cleaner. External navigation rechecks the current location and
hands off to the device maps app, which recalculates its own path.

Public Valhalla and Open-Meteo endpoints have no availability guarantee and
may rate-limit requests. Exact route endpoints are sent to Valhalla after
consent; rounded city coordinates are sent to Open-Meteo. Address lookup uses
the device platform geocoder (Apple or Google). Open-Meteo's free API is for
non-commercial use and data is licensed CC BY 4.0; replace it with a suitable
provider before commercial distribution.

## Maps and data providers

The app renders its own in-app maps with MapLibre Native and the public
OpenFreeMap Liberty style, using OpenStreetMap data. It does not embed the
MAPS.ME app/SDK. No map API key or application server is required. OpenFreeMap
is a public service with no SLA; the style URL is configurable through
`EXPO_PUBLIC_MAP_STYLE_URL`. MapLibre is isolated in `components/RouteMap.tsx`,
so another native provider can be added there later without changing route
recording, storage, or route analysis.

OpenStreetMap attribution is shown on the map. OpenFreeMap receives map-tile
requests for the visible area. Route searches send the selected coordinates
to Valhalla; Open-Meteo receives rounded coordinates for city conditions.
There are no app-owned servers or analytics uploads. Third-party providers
process their requests under their own privacy policies; the app cannot
guarantee how long those providers retain service logs.
Provider URLs can be overridden with `EXPO_PUBLIC_MAP_STYLE_URL`,
`EXPO_PUBLIC_ROUTING_ENDPOINT`, `EXPO_PUBLIC_AIR_QUALITY_ENDPOINT`, and
`EXPO_PUBLIC_WEATHER_ENDPOINT` in `.env`.

## Local profile, database, and diagnostics

The profile is a local display name, not a cloud identity: no email, password,
remote account, or cross-device synchronization exists. Routes, points,
manual place labels, and diagnostic logs are stored in the on-device SQLite
database. SQLCipher is enabled, with a randomly generated key held in Android
Keystore/iOS Keychain. Existing plaintext databases are copied into a keyed
database, verified, and deleted only after the migrated route and point counts
match.
Diagnostic logs are capped at 500 entries and omit GPS coordinates; users can
export or clear them in Settings. Android cloud backup is disabled so the
database is not copied without its device-only encryption key. Settings also
supports deleting the local profile, routes, and diagnostic logs together.

## Local Android release APK

```sh
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is written to
`src/android/app/build/outputs/apk/release/app-release.apk` and includes its JS
bundle, so it launches without Metro. The local generated release build uses
the development signing key and is for device testing only; sign with a
production keystore before store distribution. `assembleDebug` is a Metro
development build and is not the standalone APK.

## Dependency audit

Run `npm audit` before release. At the current MVP dependency set, no high or
critical advisories remain; low-severity advisories are still reported in
Expo/configuration and SVG tooling dependencies and should be reviewed again
before publishing.
