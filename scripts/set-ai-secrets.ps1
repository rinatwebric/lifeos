#Requires -Version 5.1
<#
.SYNOPSIS
  Writes the ai-assistant Edge Function secrets (AI_PROVIDER / AI_BASE_URL / AI_MODEL /
  AI_API_KEY / AI_TIMEOUT_MS) without ever echoing the key.

.DESCRIPTION
  The key is read with a hidden prompt, verified against "{BaseUrl}/models" and then
  passed to `supabase secrets set`. It is never printed, never written to disk and
  removed from the process memory afterwards. Nothing here is committed: secrets live
  in the Supabase project only.

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
    throw "supabase CLI завершился с кодом $LASTEXITCODE"
  }
}

if ($Stub) {
  Invoke-SupabaseCli -Arguments @("secrets", "set", "--project-ref", $ProjectRef, "AI_PROVIDER=stub")
  Invoke-SupabaseCli -Arguments @("secrets", "list", "--project-ref", $ProjectRef)
  Write-Host "Готово: провайдер = stub (ключ не нужен, денег не тратит)."
  return
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = Read-Host "Base URL провайдера (например https://api.meta.ai/v1)"
}
if ([string]::IsNullOrWhiteSpace($Model)) {
  $Model = Read-Host "Model ID (например muse-spark-1.3)"
}

$BaseUrl = $BaseUrl.Trim().TrimEnd("/")
$Model = $Model.Trim()

$secure = Read-Host "API key (ввод скрыт)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Пустой ключ: отменено."
  }

  if (-not $SkipVerify) {
    $modelsUrl = "$BaseUrl/models"
    Write-Host "Проверяю ключ: GET $modelsUrl"
    $status = (& curl.exe -s -o NUL -w "%{http_code}" $modelsUrl -H "Authorization: Bearer $key").Trim()

    if ($status -ne "200") {
      throw @"
Ключ или Base URL не приняты (HTTP $status).
- 401/403: ключ чужой для этого Base URL (Meta-ключ ≠ ключ шлюза) или отозван.
- 404: у провайдера нет /models — запусти с -SkipVerify, но сначала проверь руками.
Ничего не записано.
"@
    }
    Write-Host "Ключ принят (HTTP 200)."
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
  Write-Host "Готово: живые секреты записаны в проект $ProjectRef."
}
finally {
  Remove-Variable key, secure, bstr -ErrorAction SilentlyContinue
}