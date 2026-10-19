param(
    [Parameter(Mandatory=$true)][string]$UnsignedBundle,
    [Parameter(Mandatory=$true)][string]$SigningDirectory,
    [Parameter(Mandatory=$true)][string]$Bundletool,
    [Parameter(Mandatory=$true)][string]$SignedBundle
)
$ErrorActionPreference = 'Stop'
$keyFile = Join-Path $SigningDirectory 'circlo-upload.p12'
$passwordFile = Join-Path $SigningDirectory 'upload-password.dpapi'
$target = [IO.Path]::GetFullPath($SignedBundle)
$ancestor = [IO.DirectoryInfo]::new([IO.Path]::GetDirectoryName($target))
while ($null -ne $ancestor) {
    if (Test-Path -LiteralPath (Join-Path $ancestor.FullName '.git')) { throw 'Signed artifacts must be outside Git.' }
    $ancestor = $ancestor.Parent
}
if (Test-Path -LiteralPath $target) { throw 'Refusing to overwrite an existing signed release artifact.' }
foreach ($file in @($UnsignedBundle, $keyFile, $passwordFile)) { if (!(Test-Path -LiteralPath $file)) { throw 'Required local bundle/signing input missing.' } }
if ((Get-FileHash -LiteralPath $Bundletool -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29') { throw 'Unverified bundletool input.' }
$manifestText = & (Join-Path $env:JAVA_HOME 'bin\java.exe') -jar $Bundletool dump manifest "--bundle=$UnsignedBundle" --module=base
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect bundle identity before signing.' }
$manifestDocument = [xml]($manifestText -join "`n")
$androidNamespace = 'http://schemas.android.com/apk/res/android'
$manifest = $manifestDocument.DocumentElement
if ($manifest.GetAttribute('package') -ne 'chat.circlo.app' -or $manifest.GetAttribute('versionCode', $androidNamespace) -ne '17' -or $manifest.GetAttribute('versionName', $androidNamespace) -ne '0.9.8') { throw 'Bundle identity/version does not match the approved release.' }
if ($manifest.application.GetAttribute('debuggable', $androidNamespace) -eq 'true') { throw 'Debuggable bundle must not be release-signed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($UnsignedBundle))
try { if (@($archive.Entries | Where-Object { $_.FullName -match '^META-INF/.*\.(SF|RSA|DSA|EC)$' }).Count) { throw 'Input bundle is already signed.' } }
finally { $archive.Dispose() }
$secure = ConvertTo-SecureString ([IO.File]::ReadAllText($passwordFile))
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:CIRCLO_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
    Copy-Item -LiteralPath $UnsignedBundle -Destination $target
    $jarsigner = Join-Path $env:JAVA_HOME 'bin\jarsigner.exe'
    & $jarsigner -keystore $keyFile -storepass:env CIRCLO_KEY_PASSWORD -keypass:env CIRCLO_KEY_PASSWORD -sigalg SHA384withRSA -digestalg SHA-384 $target circlo-upload
    if ($LASTEXITCODE -ne 0) { throw 'Bundle signing failed; do not distribute the output.' }
    $verification = & $jarsigner -verify -verbose -certs $target 2>&1
    if ($LASTEXITCODE -ne 0 -or !($verification -match 'jar verified\.')) { throw 'Signed bundle verification did not establish a valid JAR signature.' }
    $archive = [IO.Compression.ZipFile]::OpenRead($target)
    try { if (!(@($archive.Entries | Where-Object { $_.FullName -match '^META-INF/.*\.SF$' }).Count) -or !(@($archive.Entries | Where-Object { $_.FullName -match '^META-INF/.*\.RSA$' }).Count)) { throw 'Actual signature entries are missing.' } }
    finally { $archive.Dispose() }
    # No timestamp authority or other third-party service is contacted.
    Write-Output 'AAB signed and JAR signature verified. Check package, manifest and certificate before release.'
    Get-FileHash -LiteralPath $target -Algorithm SHA256
} finally {
    Remove-Item Env:CIRCLO_KEY_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
}
