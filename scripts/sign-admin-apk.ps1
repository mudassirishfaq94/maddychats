param(
    [Parameter(Mandatory=$true)][string]$SigningDirectory,
    [Parameter(Mandatory=$true)][string]$OutputApk,
    [string]$BuildTools = "$env:ANDROID_HOME\build-tools\36.0.0"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$inputApk = Join-Path $repo 'android-admin\app\build\outputs\apk\release\app-release-unsigned.apk'
$keyFile = Join-Path $SigningDirectory 'circlo-upload.p12'
$passwordFile = Join-Path $SigningDirectory 'upload-password.dpapi'
$target = [IO.Path]::GetFullPath($OutputApk)
$ancestor = [IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($target))
while ($null -ne $ancestor) {
    if (Test-Path -LiteralPath (Join-Path $ancestor.FullName '.git')) { throw 'Keep signed releases outside Git.' }
    $ancestor = $ancestor.Parent
}
if (Test-Path -LiteralPath $target) { throw 'Refusing to overwrite a signed release.' }
foreach ($file in @($inputApk, $keyFile, $passwordFile)) {
    if (!(Test-Path -LiteralPath $file)) { throw 'Required build or local signing input missing.' }
}
$badging = & "$BuildTools\aapt.exe" dump badging $inputApk
if ($LASTEXITCODE -ne 0 -or !($badging -match "package: name='chat.circlo.admin' versionCode='1' versionName='1.0.0'") -or ($badging -match 'application-debuggable')) { throw 'Wrong app identity or a debuggable build.' }
$secure = ConvertTo-SecureString ([IO.File]::ReadAllText($passwordFile))
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$aligned = $target + '.aligned'
try {
    $env:CIRCLO_ADMIN_SIGN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    & "$BuildTools\zipalign.exe" -P 16 -f 4 $inputApk $aligned
    if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
    & "$BuildTools\apksigner.bat" sign --ks $keyFile --ks-key-alias circlo-upload --ks-pass env:CIRCLO_ADMIN_SIGN_PASSWORD --key-pass env:CIRCLO_ADMIN_SIGN_PASSWORD --out $target $aligned
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed; do not distribute the output.' }
    & "$BuildTools\apksigner.bat" verify --verbose --print-certs $target
    if ($LASTEXITCODE -ne 0) { throw 'Signed APK verification failed.' }
    & "$BuildTools\zipalign.exe" -c -P 16 4 $target
    if ($LASTEXITCODE -ne 0) { throw 'Signed APK alignment verification failed.' }
    Get-FileHash -LiteralPath $target -Algorithm SHA256
} finally {
    Remove-Item Env:CIRCLO_ADMIN_SIGN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
    if (Test-Path -LiteralPath $aligned) { Remove-Item -LiteralPath $aligned }
}
