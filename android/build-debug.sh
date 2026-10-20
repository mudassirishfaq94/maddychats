#!/bin/bash
# ZipTalk Android Build Script
# Builds the debug APK using locally installed JDK + Android SDK.
#
# Prerequisites (already installed):
#   JDK 21 at $HOME/jdk/jdk-21.0.2
#   Android SDK at $HOME/android-sdk (platforms;android-36, build-tools;36.0.0)
#
# Usage:
#   ./android/build-debug.sh          # Build debug APK
#   ./android/build-debug.sh release  # Build release APK (needs signing key)

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
JAVA_HOME_DIR="$HOME/jdk/jdk-21.0.2"
ANDROID_SDK_DIR="$HOME/android-sdk"

export JAVA_HOME="$JAVA_HOME_DIR"
export ANDROID_HOME="$ANDROID_SDK_DIR"
export ANDROID_SDK_ROOT="$ANDROID_SDK_DIR"
export PATH="$JAVA_HOME/bin:$PATH"

echo "=== ZipTalk Android Build ==="
echo "Java:   $(java -version 2>&1 | head -1)"
echo "SDK:    $ANDROID_SDK_DIR"
echo ""

# Step 1: Sync Capacitor web assets
echo ">> Syncing Capacitor..."
cd "$PROJECT_DIR"
npx cap sync android

# Step 2: Build
cd "$ANDROID_DIR"
if [ "${1:-debug}" = "release" ]; then
  echo ">> Building release APK..."
  ./gradlew assembleRelease --no-daemon
  APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
  echo ""
  echo "Release APK: $ANDROID_DIR/$APK_PATH"
  echo "To sign: jarsigner -keystore <keystore> -storepass <pass> $APK_PATH <alias>"
else
  echo ">> Building debug APK..."
  ./gradlew assembleDebug --no-daemon
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
  cp "$APK_PATH" "$PROJECT_DIR/ziptalk-debug.apk"
  echo ""
  echo "Debug APK: $PROJECT_DIR/ziptalk-debug.apk"
  echo "Install: adb install ziptalk-debug.apk"
fi
