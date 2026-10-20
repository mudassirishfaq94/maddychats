# ZipTalk Android App

Native Android client for ZipTalk, built with Kotlin and Jetpack Compose.

## Architecture

The app renders native Android screens; it does not contain a WebView, a PWA,
or a Trusted Web Activity. It connects over HTTPS to the existing Next.js API
at `https://ziptalks.vercel.app` and stores the server session cookie in the
app's private storage.

| Native capability | How it works |
|---|---|
| **UI** | Kotlin + Jetpack Compose |
| **Network/session** | OkHttp + persisted HTTPS cookie session |
| **Chat** | Native conversation list, history and message composer |
| **Status bar / keyboard** | Native Android window and Compose layout |
| **Deep links** | `ziptalks://` and `https://ziptalks.vercel.app` intent filters |

The native shell loads the hosted application. Encryption and decryption run locally in the WebView; the server stores ciphertext and handles authentication, message persistence and realtime delivery.

## Prerequisites

### Installed automatically (no action needed)

- **JDK 21**: `$HOME/jdk/jdk-21.0.2`
- **Android SDK**: `$HOME/android-sdk` (platforms;android-36, build-tools;36.0.0, platform-tools)

### You need

- **Android device** with USB debugging enabled (for install), or Android emulator
- **Google Play Developer Account** (for Play Store publication — not needed for sideloading)

## Quick Build

### Windows

```cmd
android\build-debug.bat
```

### macOS / Linux

```bash
chmod +x android/build-debug.sh
./android/build-debug.sh
```

### Install on device

```bash
adb install ziptalk-debug.apk
```

Or transfer `ziptalk-debug.apk` to your Android device and open it.

## Build Commands

```bash
# Debug APK (unsigned, for development)
./android/build-debug.sh

# Release APK (unsigned, needs signing key for distribution)
./android/build-debug.sh release

# Or use Gradle directly
cd android
export JAVA_HOME=$HOME/jdk/jdk-21.0.2
export ANDROID_HOME=$HOME/android-sdk
export PATH=$JAVA_HOME/bin:$PATH
./gradlew assembleDebug
```

## Signing for Production

### Create a release keystore

```bash
keytool -genkey -v -keystore ziptalk-release.keystore \
  -alias ziptalk -keyalg RSA -keysize 2048 -validity 10000
```

### Sign the APK

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore ziptalk-release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk ziptalk

zipalign -v 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  ziptalk-release-signed.apk
```

### Or use Android Studio Build → Generate Signed Bundle / APK

## App Configuration

| Property | Value |
|---|---|
| App name | ZipTalk |
| Package ID | `app.ziptalks.android` |
| Min SDK | 24 (Android 7.0) |
| Target SDK | 36 (Android 16) |
| Web URL | `https://ziptalks.vercel.app` |
| Deep link scheme | `ziptalks://` |
| Theme color | `#0f766e` (teal) |
| Background | `#0b1211` (dark) |

## Permissions

| Permission | Purpose |
|---|---|
| INTERNET | Chat, E2EE, media upload |
| CAMERA | Photo/video attachments |
| RECORD_AUDIO | Voice messages |
| READ_MEDIA_* | File picker (Android 13+) |
| POST_NOTIFICATIONS | Push notifications |
| VIBRATE | Notification vibration |
| WAKE_LOCK | Background notification delivery |

## Google Play Publication

1. Create a signed AAB (Android App Bundle) with a release keystore
2. Upload to [Google Play Console](https://play.google.com/console)
3. Complete content rating, data safety, and privacy policy forms
4. Add Digital Asset Links (SHA-256 of signing key) to `https://ziptalks.vercel.app/.well-known/assetlinks.json`
5. Submit for review

## Capacitor Workflow

After any web UI changes:

```bash
cd android
npx cap sync android    # copies updated web assets into the Android project
./gradlew assembleDebug  # rebuild
```

Or use `npx cap open android` to open in Android Studio (if installed).

## Troubleshooting

| Issue | Fix |
|---|---|
| `Could not determine dependencies` | Ensure `JAVA_HOME` and `ANDROID_HOME` are set |
| `Duplicate resources` | Remove duplicate `splash.png` in `res/drawable/` |
| SDK not found | Check `android/local.properties` has correct `sdk.dir` |
| Build fails with spaces in path | Use the Gradle wrapper inside `android/`, not from a parent dir |
| Push notifications don't appear | Ensure FCM `google-services.json` is in `android/app/` |
| App shows browser toolbar | Domain verification failed — check `assetlinks.json` |
| Microphone permission denied | Check Android Settings → Apps → ZipTalk → Permissions |

## File Structure

```
android/
├── app/
│   ├── build.gradle          # App-level build config
│   └── src/main/
│       ├── AndroidManifest.xml   # Permissions, deep links, providers
│       ├── java/.../MainActivity.java
│       └── res/
│           ├── drawable/splash.xml   # Splash screen
│           ├── values/
│           │   ├── colors.xml        # ZipTalk brand colors
│           │   ├── strings.xml       # App name
│           │   └── styles.xml        # Dark theme
│           └── xml/
│               ├── file_paths.xml           # FileProvider paths
│               └── network_security_config.xml  # Cleartext for dev
├── build.gradle              # Root build config
├── variables.gradle          # SDK versions
├── gradle.properties         # Gradle + SDK settings
├── build-debug.sh            # Build script (macOS/Linux)
├── build-debug.bat           # Build script (Windows)
└── README.md                 # This file
```


## Updating the app

The installed app loads its authenticated UI in its own Capacitor WebView from
`https://ziptalks.vercel.app`, so server and web UI fixes are available the
next time the app is opened. The native build deliberately does not register
the browser PWA service worker or run the browser's auto-reload updater;
Android notifications are delivered by FCM instead.

A change to the native shell, Android manifest, native plugins, Firebase configuration or signing still requires an APK update (installed over the existing app with the same package and signing key, not uninstall/reinstall). An already-running old web version needs one reopen/reload to pick up the new version checker.
