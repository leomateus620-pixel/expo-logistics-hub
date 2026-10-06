param(
  [string]$RuntimePath = '.git/dashboard-db-runtime',
  [int]$DatabasePort = 65441,
  [Parameter(Mandatory = $true)][string]$SchemaPath,
  [Parameter(Mandatory = $true)][string]$MigrationPath,
  [Parameter(Mandatory = $true)][string]$TestPath,
  [string]$ConcurrencyScript
)
$ErrorActionPreference = 'Stop'
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryPath $RuntimePath))
$gitDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryPath '.git'))
if (-not $runtimeDirectory.StartsWith($gitDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The local test runtime must remain within this checkout .git directory.'
}
$pgBin = Join-Path $runtimeDirectory 'postgresql/pgsql/bin'
foreach ($binary in @('initdb.exe', 'postgres.exe', 'psql.exe', 'pg_ctl.exe', 'pg_isready.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $pgBin $binary))) {
    throw 'Portable PostgreSQL unavailable. Prepare the existing scripts/dashboard/db-smoke-runtime.py runtime first.'
  }
}
if (Get-NetTCPConnection -LocalPort $DatabasePort -State Listen -ErrorAction SilentlyContinue) {
  throw "Local test port occupied: $DatabasePort"
}
$runDirectory = Join-Path $runtimeDirectory ('agenda-restaurant-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$dataDirectory = Join-Path $runDirectory 'data'
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$psql = Join-Path $pgBin 'psql.exe'
$psqlArguments = @('-X', '-h', '127.0.0.1', '-p', $DatabasePort, '-U', 'postgres', '-d', 'agenda_restaurant_test', '-v', 'ON_ERROR_STOP=1')
$postgresProcess = $null
$originalProcessPath = $env:Path
function Invoke-TestSql([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $psql @psqlArguments '-c' 'SET client_min_messages=warning;' '-f' $resolved 2>&1 | Out-File -LiteralPath (Join-Path $runDirectory ([IO.Path]::GetFileName($path) + '.log')) -Encoding utf8
  $sqlExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($sqlExitCode -ne 0) {
    Get-Content -LiteralPath (Join-Path $runDirectory ([IO.Path]::GetFileName($path) + '.log')) -Tail 35
    throw "Local SQL check failed: $path"
  }
}
try {
  $env:Path = $pgBin + [IO.Path]::PathSeparator + $originalProcessPath
  & (Join-Path $pgBin 'initdb.exe') '-D' $dataDirectory '-U' 'postgres' '-A' 'trust' '--encoding=UTF8' '--no-locale' '--no-instructions' *> (Join-Path $runDirectory 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'Portable initdb failed.' }
  $postgresProcess = Start-Process -FilePath (Join-Path $pgBin 'postgres.exe') -ArgumentList @('-D', "`"$dataDirectory`"", '-p', $DatabasePort, '-h', '127.0.0.1') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'postgres.stdout.log') -RedirectStandardError (Join-Path $runDirectory 'postgres.stderr.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & (Join-Path $pgBin 'pg_isready.exe') '-h' '127.0.0.1' '-p' $DatabasePort '-U' 'postgres' *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not start on loopback.' }
  & $psql '-h' '127.0.0.1' '-p' $DatabasePort '-U' 'postgres' '-d' 'postgres' '-v' 'ON_ERROR_STOP=1' '-c' 'CREATE DATABASE agenda_restaurant_test;' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create local synthetic database.' }
  Invoke-TestSql $SchemaPath
  Invoke-TestSql $MigrationPath
  # Reapply to catch incompatible signature changes and unsafe installation replay.
  Invoke-TestSql $MigrationPath
  Invoke-TestSql $TestPath
  if ($ConcurrencyScript) {
    & node $ConcurrencyScript '--psql' $psql '--port' $DatabasePort '--database' 'agenda_restaurant_test' '--output' $runDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent synthetic SQL requests failed.' }
  }
  Write-Output "Local PostgreSQL checks passed: $runDirectory"
} finally {
  $env:Path = $originalProcessPath
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & (Join-Path $pgBin 'pg_ctl.exe') '-D' $dataDirectory '-m' 'fast' 'stop' *> $null
    if ($LASTEXITCODE -ne 0) { Stop-Process -Id $postgresProcess.Id -ErrorAction SilentlyContinue }
  }
}
