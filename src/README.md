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

## Android Google Maps

The API key is optional for building, but Android map tiles require a key.
Create a key in Google Cloud, enable **Maps SDK for Android**, then restrict it
to the Android app `com.routeguide.app`, its signing certificate SHA-1, and
only the required API. Put the key in a local `src/.env` file:

```dotenv
GOOGLE_MAPS_ANDROID_API_KEY=your-restricted-key
```

`src/.env` is ignored by Git. Never commit or share the key. `.env.example`
documents the available settings. EAS build environments need the same
variable configured as a secret/environment variable.

## Local Android debug APK

```sh
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
```

The APK is written to
`src/android/app/build/outputs/apk/debug/app-debug.apk`. A debug APK is for
testing, not store distribution; a release requires production signing.

## Dependency audit

Run `npm audit` before release. At the current MVP dependency set, no high or
critical advisories remain; low-severity advisories are still reported in
Expo/configuration and SVG tooling dependencies and should be reviewed again
before publishing.
