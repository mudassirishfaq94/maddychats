@echo off
REM ZipTalk Android Build Script (Windows)
REM Usage: android\build-debug.bat

setlocal

set "JAVA_HOME=%USERPROFILE%\jdk\jdk-21.0.2"
set "ANDROID_HOME=%USERPROFILE%\android-sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo === ZipTalk Android Build ===
echo Java: %JAVA_HOME%

REM Step 1: Sync Capacitor web assets
echo >> Syncing Capacitor...
cd /d "%~dp0\.."
call npx cap sync android

REM Step 2: Build debug APK
echo >> Building debug APK...
cd /d "%~dp0"
call gradlew.bat assembleDebug --no-daemon

if %ERRORLEVEL% EQU 0 (
    echo.
    echo BUILD SUCCESSFUL
    copy "app\build\outputs\apk\debug\app-debug.apk" "..\ziptalk-debug.apk" >nul
    echo APK: %~dp0\..\ziptalk-debug.apk
    echo Install: adb install ziptalk-debug.apk
) else (
    echo BUILD FAILED
    exit /b 1
)
