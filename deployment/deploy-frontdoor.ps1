<#
.SYNOPSIS
    Deploys Azure Front Door Standard for SystemDraw (HTTPS layer in front of ACI).

.DESCRIPTION
    Creates (or updates) an Azure Front Door profile, endpoint, origin group,
    origin, and route.  Designed to be called by deploy-frontdoor-dev.ps1 which
    reads values from .env.

.PARAMETER ResourceGroup
    Azure resource group that contains the ACI container.

.PARAMETER FdProfileName
    Name of the Front Door profile to create / update.

.PARAMETER FdEndpointName
    Name of the Front Door endpoint (becomes <name>-<hash>.azurefd.net).

.PARAMETER FdOriginGroup
    Name of the origin group.

.PARAMETER FdOriginName
    Name of the origin inside the group.

.PARAMETER FdSku
    Front Door SKU. Default: Standard_AzureFrontDoor.

.PARAMETER OriginHostName
    FQDN of the ACI container (e.g. systemdraw-app.westus2.azurecontainer.io).
    If not supplied it is derived from ContainerName via az container show.

.PARAMETER ContainerName
    ACI container name — used to look up OriginHostName if not provided.

.PARAMETER RouteName
    Name of the default route. Default: default-route.
#>

param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [Parameter(Mandatory)][string]$FdProfileName,
    [Parameter(Mandatory)][string]$FdEndpointName,
    [Parameter(Mandatory)][string]$FdOriginGroup,
    [Parameter(Mandatory)][string]$FdOriginName,
    [string]$FdSku            = "Standard_AzureFrontDoor",
    [string]$OriginHostName   = "",
    [string]$ContainerName    = "",
    [string]$RouteName        = "default-route"
)

$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step { param([int]$n,[int]$of,[string]$msg) Write-Host "`n[$n/$of] $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Skip { param([string]$msg) Write-Host "  → $msg (already exists)" -ForegroundColor Yellow }

$totalSteps = 6

# ── 1. Resolve origin hostname ───────────────────────────────────────────────
Write-Step 1 $totalSteps "Resolving origin hostname"
if ($OriginHostName -eq "") {
    if ($ContainerName -eq "") {
        Write-Error "Either -OriginHostName or -ContainerName must be provided."
        exit 1
    }
    $OriginHostName = az container show `
        --resource-group $ResourceGroup `
        --name $ContainerName `
        --query "ipAddress.fqdn" -o tsv
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($OriginHostName)) {
        Write-Error "Failed to resolve FQDN for container '$ContainerName'."
        exit 1
    }
}
Write-Ok "Origin: $OriginHostName"

# ── 2. Front Door profile ────────────────────────────────────────────────────
Write-Step 2 $totalSteps "Front Door profile: $FdProfileName"
$existing = az afd profile show --profile-name $FdProfileName --resource-group $ResourceGroup 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Skip $FdProfileName
} else {
    az afd profile create `
        --profile-name $FdProfileName `
        --resource-group $ResourceGroup `
        --sku $FdSku
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create Front Door profile."; exit 1 }
    Write-Ok "Created profile $FdProfileName ($FdSku)"
}

# ── 3. Endpoint ──────────────────────────────────────────────────────────────
Write-Step 3 $totalSteps "Endpoint: $FdEndpointName"
$existing = az afd endpoint show --endpoint-name $FdEndpointName --profile-name $FdProfileName --resource-group $ResourceGroup 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Skip $FdEndpointName
} else {
    az afd endpoint create `
        --endpoint-name $FdEndpointName `
        --profile-name $FdProfileName `
        --resource-group $ResourceGroup `
        --enabled-state Enabled
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create endpoint."; exit 1 }
    Write-Ok "Created endpoint $FdEndpointName"
}

# ── 4. Origin group ──────────────────────────────────────────────────────────
Write-Step 4 $totalSteps "Origin group: $FdOriginGroup"
$existing = az afd origin-group show --origin-group-name $FdOriginGroup --profile-name $FdProfileName --resource-group $ResourceGroup 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Skip $FdOriginGroup
} else {
    az afd origin-group create `
        --origin-group-name $FdOriginGroup `
        --profile-name $FdProfileName `
        --resource-group $ResourceGroup `
        --probe-request-type GET `
        --probe-protocol Http `
        --probe-interval-in-seconds 30 `
        --probe-path "/" `
        --sample-size 4 `
        --successful-samples-required 3 `
        --additional-latency-in-milliseconds 50
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create origin group."; exit 1 }
    Write-Ok "Created origin group $FdOriginGroup"
}

# ── 5. Origin ─────────────────────────────────────────────────────────────────
Write-Step 5 $totalSteps "Origin: $FdOriginName → $OriginHostName"
$existing = az afd origin show --origin-name $FdOriginName --origin-group-name $FdOriginGroup --profile-name $FdProfileName --resource-group $ResourceGroup 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Skip $FdOriginName
} else {
    az afd origin create `
        --origin-name $FdOriginName `
        --origin-group-name $FdOriginGroup `
        --profile-name $FdProfileName `
        --resource-group $ResourceGroup `
        --host-name $OriginHostName `
        --origin-host-header $OriginHostName `
        --http-port 80 `
        --priority 1 `
        --weight 1000 `
        --enabled-state Enabled
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create origin."; exit 1 }
    Write-Ok "Created origin $FdOriginName"
}

# ── 6. Route ──────────────────────────────────────────────────────────────────
Write-Step 6 $totalSteps "Route: $RouteName"
$existing = az afd route show --route-name $RouteName --endpoint-name $FdEndpointName --profile-name $FdProfileName --resource-group $ResourceGroup 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Skip $RouteName
} else {
    az afd route create `
        --route-name $RouteName `
        --endpoint-name $FdEndpointName `
        --profile-name $FdProfileName `
        --resource-group $ResourceGroup `
        --origin-group $FdOriginGroup `
        --supported-protocols Https Http `
        --forwarding-protocol HttpOnly `
        --https-redirect Enabled `
        --patterns-to-match "/*" `
        --link-to-default-domain Enabled
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create route."; exit 1 }
    Write-Ok "Created route $RouteName"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Green
Write-Host " Front Door deployment complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

$endpointHost = az afd endpoint show `
    --endpoint-name $FdEndpointName `
    --profile-name $FdProfileName `
    --resource-group $ResourceGroup `
    --query "hostName" -o tsv 2>$null

if ($endpointHost) {
    Write-Host "  HTTPS URL : https://$endpointHost" -ForegroundColor Yellow
}
Write-Host "  Origin    : $OriginHostName" -ForegroundColor Yellow
Write-Host ""
