[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$marketplace = "devku-imagegen"
$repository = "hiccup711/devku_imagegen"

if ($null -eq (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 or newer is required."
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Found: $(& node --version)"
}

if ($null -eq (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI is required."
}

$credentialDirectory = Join-Path $env:LOCALAPPDATA "Devku\ImageGen"
$credentialPath = Join-Path $credentialDirectory "credential.dat"
$secureKey = Read-Host "Devku Image API Key" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([String]::IsNullOrWhiteSpace($plainKey)) {
        throw "API Key cannot be empty."
    }

    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plainKey)
    $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect(
        $plainBytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )

    New-Item -ItemType Directory -Path $credentialDirectory -Force | Out-Null
    [IO.File]::WriteAllBytes($credentialPath, $encryptedBytes)
}
finally {
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    if ($null -ne $plainKey) { $plainKey = $null }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Host "Credential encrypted with Windows DPAPI and saved for the current user."

$marketplaceExists = codex plugin marketplace list | Select-String -Pattern "^\s*$marketplace\s"
if ($null -ne $marketplaceExists) {
    codex plugin marketplace upgrade $marketplace
}
else {
    codex plugin marketplace add $repository
}

codex plugin add "devku-imagegen@$marketplace"

Write-Host "Devku Image Gen plugin installed."
Write-Host "Restart Codex and start a new task before testing image generation."
