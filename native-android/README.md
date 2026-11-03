# Road Guide native Android MVP

This is a standalone Kotlin/Jetpack Compose application. It does not depend on
the Expo project in `src/` and deliberately contains no GPS, map provider,
route, history storage, or environmental data implementation.

## Build requirements

- JDK 17 (the Gradle wrapper uses Gradle 8.13; Android Gradle Plugin 8.13.2)
- Android SDK Platform 36
- Android SDK Build-Tools 36.0.0
- Android SDK Command-line Tools

Set `JAVA_HOME` to a JDK 17 installation and `ANDROID_HOME` to the SDK root.
Install SDK packages if needed:

```sh
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

From this directory, build the debug APK:

```sh
./gradlew --no-daemon assembleDebug
```

The APK is created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

The temporary application ID is `com.routeguide.mvp`, separate from the Expo
application. The debug build can be started without Metro:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.routeguide.mvp/.MainActivity
```

Compose navigation coverage is in `app/src/androidTest/`. Run it on an available
Android emulator with:

```sh
./gradlew --no-daemon connectedDebugAndroidTest
```

The screens intentionally show empty/unavailable states until their future
features are implemented. The supplied visual references are not used as
sources of location, GPS, route, or environmental values.
