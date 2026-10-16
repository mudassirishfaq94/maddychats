param([Parameter(Mandatory=$true)][string]$SigningDirectory)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This script requires Windows DPAPI.' }
$releaseDirectory = [IO.Path]::GetFullPath($SigningDirectory)
$ancestor = [IO.DirectoryInfo]::new($releaseDirectory)
while ($null -ne $ancestor) {
    if (Test-Path -LiteralPath (Join-Path $ancestor.FullName '.git')) { throw 'Signing directory must be outside all Git checkouts.' }
    $ancestor = $ancestor.Parent
}
$keyFile = Join-Path $releaseDirectory 'circlo-upload.p12'
$passwordFile = Join-Path $releaseDirectory 'upload-password.dpapi'
if ((Test-Path -LiteralPath $keyFile) -or (Test-Path -LiteralPath $passwordFile)) { throw 'Existing signing material must never be replaced.' }
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (!(Test-Path -LiteralPath $keytool)) { throw 'Set JAVA_HOME to the approved JDK.' }
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $releaseDirectory
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
foreach ($sid in @($ownerSid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $releaseDirectory -AclObject $acl
$random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
try {
    $env:CIRCLO_KEY_PASSWORD = [Convert]::ToBase64String($random)
    $secure = ConvertTo-SecureString $env:CIRCLO_KEY_PASSWORD -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secure
    [IO.File]::WriteAllText($passwordFile, $encrypted)
    & $keytool -genkeypair -storetype PKCS12 -keystore $keyFile -storepass:env CIRCLO_KEY_PASSWORD -keypass:env CIRCLO_KEY_PASSWORD -alias circlo-upload -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Circlo Upload Key'
    if ($LASTEXITCODE -ne 0) { throw 'Key generation failed. Preserve any partial material for inspection; do not silently retry or overwrite.' }
    & $keytool -exportcert -rfc -keystore $keyFile -storepass:env CIRCLO_KEY_PASSWORD -alias circlo-upload -file (Join-Path $releaseDirectory 'upload-certificate.pem')
    if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed.' }
    Write-Output 'Upload key created outside Git; password is Windows-user-bound DPAPI encrypted. A portable owner-controlled backup is still required.'
} finally {
    Remove-Item Env:CIRCLO_KEY_PASSWORD -ErrorAction SilentlyContinue
    [Array]::Clear($random, 0, $random.Length)
    if ($null -ne $secure) { $secure.Dispose() }
}
