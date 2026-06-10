param(
  [string]$DbName = "callcrm",
  [string]$DbUser = "postgres",
  [string]$DbPassword = "postgres",
  [int]$DbPort = 5432
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-PostgresBinPath {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) {
    return Split-Path -Parent $cmd.Source
  }

  $candidateRoots = @(
    "C:\Program Files\PostgreSQL",
    "C:\Program Files (x86)\PostgreSQL"
  )

  foreach ($root in $candidateRoots) {
    if (-not (Test-Path $root)) { continue }
    $matches = Get-ChildItem -Path $root -Directory | Sort-Object Name -Descending
    foreach ($m in $matches) {
      $bin = Join-Path $m.FullName "bin"
      if (Test-Path (Join-Path $bin "psql.exe")) {
        return $bin
      }
    }
  }

  return $null
}

function Start-PostgresIfPossible {
  param([string]$BinPath)

  $services = Get-Service | Where-Object { $_.Name -like "postgresql*" -or $_.DisplayName -like "*PostgreSQL*" }
  if ($services) {
    foreach ($svc in $services) {
      if ($svc.Status -ne "Running") {
        Start-Service -Name $svc.Name
      }
    }
    return
  }

  $pgCtl = Join-Path $BinPath "pg_ctl.exe"
  if (-not (Test-Path $pgCtl)) {
    return
  }

  $installRoot = Split-Path -Parent $BinPath
  $dataDir = Join-Path $installRoot "data"
  if (-not (Test-Path $dataDir)) {
    return
  }

  & $pgCtl -D $dataDir -l (Join-Path $dataDir "server.log") start | Out-Null
}

Write-Host "[1/5] Checking PostgreSQL installation..."
$psqlBin = Get-PostgresBinPath

if (-not $psqlBin) {
  Write-Host "PostgreSQL not found. Attempting install via winget/choco/scoop..."

  if (Test-CommandExists "winget") {
    winget install -e --id PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements --silent
  }
  elseif (Test-CommandExists "choco") {
    choco install postgresql16 -y
  }
  elseif (Test-CommandExists "scoop") {
    scoop bucket add versions | Out-Null
    scoop install postgresql16
  }
  else {
    throw "No supported package manager found (winget/choco/scoop). Install PostgreSQL manually first."
  }

  Start-Sleep -Seconds 5
  $psqlBin = Get-PostgresBinPath
  if (-not $psqlBin) {
    throw "PostgreSQL install command ran, but psql was not found in PATH or Program Files."
  }
}

Write-Host "[2/5] Ensuring PostgreSQL service is running..."
Start-PostgresIfPossible -BinPath $psqlBin

$env:PATH = "$psqlBin;$env:PATH"
$env:PGPASSWORD = $DbPassword
$psqlExe = Join-Path $psqlBin "psql.exe"

Write-Host "[3/5] Waiting for PostgreSQL to accept connections..."
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  & $psqlExe -h localhost -p $DbPort -U $DbUser -d postgres -c "SELECT 1;" | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  throw "PostgreSQL is not accepting connections on localhost:$DbPort for user '$DbUser'. Ensure server is initialized and running."
}

Write-Host "[4/5] Creating database if missing..."
$dbCheck = & $psqlExe -h localhost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DbName}';"
if (($LASTEXITCODE -ne 0) -or (("$dbCheck").Trim() -ne "1")) {
  & $psqlExe -h localhost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE ${DbName};"
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to create database '${DbName}'. Check credentials and PostgreSQL permissions."
  }
}

Write-Host "[5/5] Setup complete."
Write-Host "Use this DATABASE_URL in .env:"
Write-Host "DATABASE_URL=postgresql://${DbUser}:${DbPassword}@localhost:${DbPort}/${DbName}?schema=public"
