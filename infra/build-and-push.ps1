<#
.SYNOPSIS
  Builds (and optionally pushes) an Ophir Docker image.

.DESCRIPTION
  Two image flavors are supported:

   - API only (default): just the Ophir API. Pair it with the multi-service
     stack in infra/docker-compose.yml (separate Grafana/Loki/Tempo/etc).

   - All-in-one (-AllInOne): a single image bundling the Ophir API plus
     Grafana, Loki, Tempo, Prometheus and the OpenTelemetry Collector.
     PostgreSQL is NOT bundled; supply DATABASE_URL at runtime.

  Neither image contains secrets; all configuration is supplied at runtime via
  environment variables. You run the final push (or pass -Push).

.EXAMPLE
  ./infra/build-and-push.ps1 -Image ghcr.io/your-org/ophir:1.0.0
  ./infra/build-and-push.ps1 -AllInOne -Image ghcr.io/your-org/ophir-allinone:1.0.0 -Push
#>
param(
  [switch]$AllInOne,
  [string]$Image = $(
    if ($env:OPHIR_IMAGE) { $env:OPHIR_IMAGE }
    elseif ($AllInOne) { "ophir-allinone:latest" }
    else { "ophir:latest" }
  ),
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

if ($AllInOne) {
  $Dockerfile = Join-Path $RepoRoot "Dockerfile.allinone"
  Write-Host "Building Ophir ALL-IN-ONE image '$Image' (context: $RepoRoot)" -ForegroundColor Cyan
  docker build -f $Dockerfile -t $Image $RepoRoot
} else {
  Write-Host "Building Ophir API image '$Image' (context: $RepoRoot)" -ForegroundColor Cyan
  docker build -t $Image $RepoRoot
}
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }
Write-Host "Built $Image" -ForegroundColor Green

if ($Push) {
  Write-Host "Pushing $Image ..." -ForegroundColor Cyan
  docker push $Image
  if ($LASTEXITCODE -ne 0) { throw "docker push failed" }
  Write-Host "Pushed $Image" -ForegroundColor Green
} else {
  Write-Host "Build only. To push:  docker push $Image" -ForegroundColor Yellow
}
