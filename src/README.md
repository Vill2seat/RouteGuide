# Route Guide MVP

## Local development

```sh
npm ci
npm run typecheck
npm run test:classifier
npx expo install --check
npx expo start
```

The app records GPS routes locally. Automatic transport classification is a
GPS-speed heuristic for walking, cycling, or generic motorized travel; it does
not identify cars, buses, trains, and motorcycles individually. Users can
choose those subtypes manually or correct the detected mode.

The route planner ranks environmental quality only among alternatives no more
than five minutes slower than the fastest option. It uses public Valhalla,
Open-Meteo, and OpenStreetMap Overpass endpoints for a prototype. Air quality
is a modelled PM2.5 estimate; road proximity is only a noise proxy, not a sound
measurement. Public endpoints have no availability guarantee and may rate
limit requests. Route searches send the selected locations to those services;
address lookup uses the device platform geocoder (Apple or Google).

## Maps and data providers

The app renders maps with MapLibre Native and the public OpenFreeMap Liberty
style, using OpenStreetMap data. No map API key or application server is
required. OpenFreeMap is a free public instance with no account or view quota,
but has no SLA; the style URL is configurable through
`EXPO_PUBLIC_MAP_STYLE_URL`. MapLibre is isolated in `components/RouteMap.tsx`,
so another native provider can be added there later without changing route
recording, storage, or route analysis.

OpenStreetMap attribution is shown on the map. Route searches send the
coordinates to public Valhalla, Open-Meteo, and Overpass services after the
user accepts the disclosure. Open-Meteo's free API is for non-commercial use
and data is licensed CC BY 4.0; it must be replaced with a suitable provider
before commercial distribution. Public routing and Overpass instances may
rate-limit requests or become unavailable. Endpoints are configurable through
the `EXPO_PUBLIC_*_ENDPOINT` variables in `.env`.

Noise is estimated only from proximity to major OSM roads, not measured in dB.
Environmental scoring and route ranking run on the device; when a provider
fails, its data is recorded as unavailable and not uploaded to an app server.

MAPS.ME does not provide an embeddable public map SDK for this use. The app
uses MapLibre/OpenStreetMap for its in-app basemap instead. Google Maps or
Yandex Maps can be added later as separate native renderers with their own
licenses, SDK configuration, and (where required) restricted API keys.

## Local profile, database, and diagnostics

The profile is a local display name, not a cloud identity: no email, password,
remote account, or cross-device synchronization exists. Routes, points, and
diagnostic logs are stored in the on-device SQLite database. SQLCipher is
enabled, with its randomly generated key held in Android Keystore/iOS Keychain.
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
