<#
.SYNOPSIS
    Dev wrapper — reads .env and calls deploy-frontdoor.ps1.

.DESCRIPTION
    Parses the .env file at the project root, validates that all required
    Front Door variables are present, sets the Azure subscription, and
    invokes the parameterised deploy-frontdoor.ps1 script.
#>

$ErrorActionPreference = "Stop"

# ── Locate .env ───────────────────────────────────────────────────────────────
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$PSScriptRoot\..\..\.env")) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
}
$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile"
    exit 1
}

# ── Parse .env ────────────────────────────────────────────────────────────────
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $envVars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

# ── Validate required keys ───────────────────────────────────────────────────
$required = @(
    "AZURE_SUBSCRIPTION",
    "RESOURCE_GROUP",
    "CONTAINER_NAME",
    "FD_PROFILE_NAME",
    "FD_ENDPOINT_NAME",
    "FD_ORIGIN_GROUP",
    "FD_ORIGIN_NAME"
)

$missing = $required | Where-Object { -not $envVars.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envVars[$_]) }
if ($missing) {
    Write-Error "Missing required .env variables: $($missing -join ', ')"
    exit 1
}

# ── Set subscription ─────────────────────────────────────────────────────────
Write-Host "Setting Azure subscription: $($envVars['AZURE_SUBSCRIPTION'])" -ForegroundColor Cyan
az account set --subscription $envVars["AZURE_SUBSCRIPTION"]
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to set Azure subscription."; exit 1 }

# ── Build optional params ────────────────────────────────────────────────────
$optionalParams = @{}
if ($envVars.ContainsKey("FD_SKU") -and $envVars["FD_SKU"]) {
    $optionalParams["FdSku"] = $envVars["FD_SKU"]
}

# ── Call parameterised script ─────────────────────────────────────────────────
$scriptPath = Join-Path $PSScriptRoot "deploy-frontdoor.ps1"

& $scriptPath `
    -ResourceGroup   $envVars["RESOURCE_GROUP"] `
    -FdProfileName   $envVars["FD_PROFILE_NAME"] `
    -FdEndpointName  $envVars["FD_ENDPOINT_NAME"] `
    -FdOriginGroup   $envVars["FD_ORIGIN_GROUP"] `
    -FdOriginName    $envVars["FD_ORIGIN_NAME"] `
    -ContainerName   $envVars["CONTAINER_NAME"] `
    @optionalParams
