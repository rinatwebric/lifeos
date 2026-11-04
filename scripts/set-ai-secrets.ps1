#Requires -Version 5.1
<#
.SYNOPSIS
  Writes the ai-assistant Edge Function secrets without ever echoing the key.

.DESCRIPTION
  The key is read with a hidden prompt, verified against "{BaseUrl}/models" and then
  passed to `supabase secrets set`. It is never printed, never written to disk and is
  removed from the process memory afterwards. Secrets live in the Supabase project only.

.EXAMPLE
  .\scripts\set-ai-secrets.ps1 -Stub
  # safe mode: AI_PROVIDER=stub, no key, no provider cost

.EXAMPLE
  .\scripts\set-ai-secrets.ps1 -BaseUrl https://api.meta.ai/v1 -Model muse-spark-1.3
  # live mode: prompts for the key, verifies GET /models, then sets the secrets

.NOTES
  Never paste a key into chat, an issue, a commit or a VITE_* variable.
  Rotate the key after the demo if it was ever shared outside this prompt.
#>
[CmdletBinding()]
param(
  [string]$ProjectRef = "svbcpjpewzivqifyckkm",
  [string]$BaseUrl = "",
  [string]$Model = "",
  [int]$TimeoutMs = 25000,
  [switch]$Stub,
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$cliArgs = @("--yes", "supabase@2.75.0")

function Invoke-SupabaseCli {
  param([string[]]$Arguments)

  & npx @cliArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "supabase CLI exited with code $LASTEXITCODE"
  }
}

if ($Stub) {
  Invoke-SupabaseCli -Arguments @("secrets", "set", "--project-ref", $ProjectRef, "AI_PROVIDER=stub")
  Invoke-SupabaseCli -Arguments @("secrets", "list", "--project-ref", $ProjectRef)
  Write-Host "Done: AI_PROVIDER=stub (no key needed, no provider cost)."
  return
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = Read-Host "Provider base URL (for example https://api.meta.ai/v1)"
}
if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = Read-Host "Model ID (for example muse-spark-1.3)"
}

$BaseUrl = $BaseUrl.Trim().TrimEnd("/")
$Model = $Model.Trim()

$secure = Read-Host "API key (input hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Empty key: cancelled, nothing written."
  }

  if (-not $SkipVerify) {
    $modelsUrl = "$BaseUrl/models"
    Write-Host "Checking the key: GET $modelsUrl"
    $status = (& curl.exe -s -o NUL -w "%{http_code}" $modelsUrl -H "Authorization: Bearer $key").Trim()

    if ($status -ne "200") {
      throw "Key or base URL rejected (HTTP $status). 401/403 means the key belongs to another base URL or was revoked; 404 means the provider has no /models (rerun with -SkipVerify after checking by hand). Nothing was written."
    }
    Write-Host "Key accepted (HTTP 200)."
  }

  Invoke-SupabaseCli -Arguments @(
    "secrets", "set", "--project-ref", $ProjectRef,
    "AI_PROVIDER=openai-compatible",
    "AI_BASE_URL=$BaseUrl",
    "AI_MODEL=$Model",
    "AI_TIMEOUT_MS=$TimeoutMs",
    "AI_API_KEY=$key"
  )

  Invoke-SupabaseCli -Arguments @("secrets", "list", "--project-ref", $ProjectRef)
  Write-Host "Done: live secrets written to project $ProjectRef."
}
finally {
  Remove-Variable key, secure, bstr -ErrorAction SilentlyContinue
}