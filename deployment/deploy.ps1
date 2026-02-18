<#
.SYNOPSIS
    Build, push, and deploy the SystemDraw container to Azure ACR + ACI.

.DESCRIPTION
    Parameterized deployment script that:
    1. Builds the Docker image from the project root
    2. Tags and pushes to Azure Container Registry
    3. Creates/updates an Azure Container Instance

.PARAMETER ResourceGroup
    Azure resource group name.

.PARAMETER AcrName
    Azure Container Registry name (without .azurecr.io).

.PARAMETER ContainerName
    Azure Container Instance name.

.PARAMETER ImageName
    Docker image name (default: systemdraw).

.PARAMETER ImageTag
    Docker image tag (default: latest).

.PARAMETER DnsLabel
    DNS name label for the ACI public FQDN.

.PARAMETER Cpu
    CPU cores for the container (default: 1).

.PARAMETER Memory
    Memory in GB for the container (default: 0.5).

.PARAMETER Port
    Container port to expose (default: 80).

.PARAMETER SkipBuild
    Skip the Docker build step (use existing local image).

.PARAMETER SkipPush
    Skip pushing to ACR (deploy from existing ACR image).

.EXAMPLE
    .\deploy.ps1 -ResourceGroup "myRg" -AcrName "myAcr" -ContainerName "myApp"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ResourceGroup,

    [Parameter(Mandatory)]
    [string]$AcrName,

    [Parameter(Mandatory)]
    [string]$ContainerName,

    [string]$ImageName = "systemdraw",

    [string]$ImageTag = (Get-Date -Format "yyyy-MM-dd-HHmmss"),

    [string]$DnsLabel = $ContainerName,

    [int]$Cpu = 1,

    [double]$Memory = 0.5,

    [int]$Port = 80,

    [switch]$SkipBuild,

    [switch]$SkipPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$loginServer = "$AcrName.azurecr.io"
$fullImage   = "$loginServer/${ImageName}:${ImageTag}"
$projectRoot = Split-Path -Parent $PSScriptRoot   # one level up from deployment/

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SystemDraw Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Resource Group : $ResourceGroup"
Write-Host "  ACR            : $loginServer"
Write-Host "  Image          : ${ImageName}:${ImageTag}"
Write-Host "  Container      : $ContainerName"
Write-Host "  DNS Label      : $DnsLabel"
Write-Host "  CPU / Memory   : $Cpu core(s) / ${Memory} GB"
Write-Host "  Port           : $Port"
Write-Host "============================================" -ForegroundColor Cyan

# --- Step 1: Build Docker image ---
if (-not $SkipBuild) {
    Write-Host "`n[1/3] Building Docker image..." -ForegroundColor Yellow
    docker build -f "$projectRoot/docker/Dockerfile" `
        -t "${ImageName}:${ImageTag}" `
        "$projectRoot" --no-cache
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }
    Write-Host "  Build complete." -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Skipping build (--SkipBuild)." -ForegroundColor DarkGray
}

# --- Step 2: Tag & push to ACR ---
if (-not $SkipPush) {
    Write-Host "`n[2/3] Pushing to ACR ($loginServer)..." -ForegroundColor Yellow

    # Login to ACR
    az acr login --name $AcrName
    if ($LASTEXITCODE -ne 0) { throw "ACR login failed." }

    # Tag & push
    docker tag "${ImageName}:${ImageTag}" $fullImage
    docker push $fullImage
    if ($LASTEXITCODE -ne 0) { throw "Docker push failed." }
    Write-Host "  Push complete." -ForegroundColor Green
} else {
    Write-Host "`n[2/3] Skipping push (--SkipPush)." -ForegroundColor DarkGray
}

# --- Step 3: Deploy to ACI ---
Write-Host "`n[3/3] Deploying to ACI ($ContainerName)..." -ForegroundColor Yellow

# Get ACR credentials
$creds = az acr credential show --name $AcrName --output json | ConvertFrom-Json
$acrPassword = $creds.passwords[0].value

az container create `
    --resource-group $ResourceGroup `
    --name $ContainerName `
    --image $fullImage `
    --cpu $Cpu `
    --memory $Memory `
    --os-type Linux `
    --registry-login-server $loginServer `
    --registry-username $AcrName `
    --registry-password $acrPassword `
    --dns-name-label $DnsLabel `
    --ports $Port `
    --output table

if ($LASTEXITCODE -ne 0) { throw "ACI deployment failed." }

# --- Done ---
$fqdn = az container show --resource-group $ResourceGroup --name $ContainerName --query "ipAddress.fqdn" -o tsv
$ip   = az container show --resource-group $ResourceGroup --name $ContainerName --query "ipAddress.ip" -o tsv

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host "  FQDN : http://$fqdn" -ForegroundColor Green
Write-Host "  IP   : http://${ip}:${Port}" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
