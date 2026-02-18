<#
.SYNOPSIS
    Deploy SystemDraw using settings from .env file.
.DESCRIPTION
    Reads configuration from the project root .env file and calls deploy.ps1.
#>

$ErrorActionPreference = "Stop"

# Load .env file from project root
$envFile = Join-Path $PSScriptRoot "..\\.env"
if (-not (Test-Path $envFile)) {
    Write-Error "Missing .env file at: $envFile`nCopy .env.example to .env and fill in your values."
    exit 1
}

# Parse .env into a hashtable
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

# Validate required keys
$required = @("AZURE_SUBSCRIPTION", "RESOURCE_GROUP", "ACR_NAME", "CONTAINER_NAME", "IMAGE_NAME", "DNS_LABEL")
foreach ($key in $required) {
    if (-not $envVars.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envVars[$key])) {
        Write-Error "Missing required .env variable: $key"
        exit 1
    }
}

# Set Azure subscription
az account set --subscription $envVars["AZURE_SUBSCRIPTION"]

# Run deployment
& "$PSScriptRoot\deploy.ps1" `
    -ResourceGroup   $envVars["RESOURCE_GROUP"] `
    -AcrName         $envVars["ACR_NAME"] `
    -ContainerName   $envVars["CONTAINER_NAME"] `
    -ImageName       $envVars["IMAGE_NAME"] `
    -DnsLabel        $envVars["DNS_LABEL"]
