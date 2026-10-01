param(
  [string]$RuntimePath = '.git/dashboard-db-runtime',
  [int]$DatabasePort = 65439,
  [int]$HttpPort = 5195,
  [string]$MigrationPath = 'supabase/migrations/20261001193000_commercial_dashboard_financial_embed.sql'
)
$ErrorActionPreference = 'Stop'
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runtimeDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryPath $RuntimePath))
$gitDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryPath '.git'))
if (-not $runtimeDirectory.StartsWith($gitDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The local database runtime must remain inside this checkout .git directory.'
}
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
$pgBin = Join-Path $runtimeDirectory 'postgresql/pgsql/bin'
$postgrestBinary = Join-Path $runtimeDirectory 'postgrest/postgrest.exe'
$originalProcessPath = $env:Path
foreach ($required in @((Join-Path $pgBin 'initdb.exe'), (Join-Path $pgBin 'postgres.exe'), $postgrestBinary)) {
  if (-not (Test-Path -LiteralPath $required)) { throw 'Prepare portable official binaries first: python scripts/dashboard/db-smoke-runtime.py' }
}
foreach ($port in @($DatabasePort, $HttpPort)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Local smoke port already occupied: $port" }
}
$runName = 'run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$runDirectory = Join-Path $runtimeDirectory $runName
$dataDirectory = Join-Path $runDirectory 'data'
New-Item -ItemType Directory -Force -Path $runDirectory | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$psql = Join-Path $pgBin 'psql.exe'
$psqlArguments = @('-h', '127.0.0.1', '-p', $DatabasePort, '-U', 'postgres', '-d', 'dashboard_smoke', '-v', 'ON_ERROR_STOP=1')
function Invoke-SmokeSqlFile([string]$path) {
  & $psql @psqlArguments '-f' $path | Out-File -LiteralPath (Join-Path $runDirectory 'migration.log') -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "SQL fixture/migration failed: $path" }
}
function Save-ViewMetadata([string]$path) {
  $sql = @'
SELECT json_build_object(
 'postgresVersion',version(),
 'columns',(SELECT json_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='commercial_lot_pricing_2028'),
 'viewOptions',(SELECT reloptions FROM pg_class WHERE oid='public.commercial_lot_pricing_2028'::regclass),
 'tieMultiplicity',(SELECT json_object_agg(public_identifier, row_count) FROM (SELECT public_identifier,count(*) row_count FROM public.commercial_lot_pricing_2028 GROUP BY public_identifier HAVING count(*)>1) repeated),
 'rootCount',(SELECT count(*) FROM public.commercial_lots WHERE project_id='30000000-0000-4000-8000-000000000001' AND archived_at IS NULL)
);
'@
  $result = & $psql @psqlArguments '-A' '-t' '-c' $sql
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the real PostgreSQL view.' }
  [IO.File]::WriteAllText($path, ($result -join "`n"), $utf8)
}
$postgresProcess = $null
$postgrestProcess = $null
try {
  # PostgREST loads libpq and its vendor DLLs from the process-local search path.
  # Do not change the user's or machine's persistent PATH.
  $env:Path = $pgBin + [IO.Path]::PathSeparator + $originalProcessPath
  & (Join-Path $pgBin 'initdb.exe') '-D' $dataDirectory '-U' 'postgres' '-A' 'trust' '--encoding=UTF8' '--no-locale' '--no-instructions' | Out-File -LiteralPath (Join-Path $runDirectory 'initdb.log') -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'Portable initdb failed.' }
  $postgresProcess = Start-Process -FilePath (Join-Path $pgBin 'postgres.exe') -ArgumentList @('-D', "`"$dataDirectory`"", '-p', $DatabasePort, '-h', '127.0.0.1') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'postgres.stdout.log') -RedirectStandardError (Join-Path $runDirectory 'postgres.stderr.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & (Join-Path $pgBin 'pg_isready.exe') '-h' '127.0.0.1' '-p' $DatabasePort '-U' 'postgres' *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Portable PostgreSQL did not start on loopback.' }
  & $psql '-h' '127.0.0.1' '-p' $DatabasePort '-U' 'postgres' '-d' 'postgres' '-v' 'ON_ERROR_STOP=1' '-c' 'CREATE DATABASE dashboard_smoke;' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create the isolated smoke database.' }
  Invoke-SmokeSqlFile (Join-Path $PSScriptRoot 'db-smoke-schema.sql')
  Invoke-SmokeSqlFile (Join-Path $repositoryPath 'supabase/migrations/20260926082845_1ddb8e8c-6673-4949-b593-3f3752d7fdbd.sql')
  & $psql @psqlArguments '-c' 'ALTER VIEW public.commercial_lot_pricing_2028 SET (security_invoker=on); GRANT SELECT ON public.commercial_lot_pricing_2028 TO authenticated, anon;' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Cannot preserve the existing pricing-view grants/options.' }
  Save-ViewMetadata (Join-Path $runDirectory 'view-before.json')
  $secretBytes = New-Object byte[] 48
  $secretGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $secretGenerator.GetBytes($secretBytes) } finally { $secretGenerator.Dispose() }
  $secret = [Convert]::ToBase64String($secretBytes)
  $secretFile = Join-Path $runDirectory 'jwt-secret.local'
  [IO.File]::WriteAllText($secretFile, $secret, $utf8)
  $configuration = @"
db-uri = "postgresql://dashboard_authenticator@127.0.0.1:$DatabasePort/dashboard_smoke"
db-schemas = "public"
db-anon-role = "anon"
db-max-rows = 1000
db-pool = 5
jwt-secret = "$secret"
server-host = "127.0.0.1"
server-port = $HttpPort
log-level = "warn"
"@
  $configurationFile = Join-Path $runDirectory 'postgrest.conf'
  [IO.File]::WriteAllText($configurationFile, $configuration, $utf8)
  $postgrestProcess = Start-Process -FilePath $postgrestBinary -ArgumentList "`"$configurationFile`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDirectory 'postgrest.stdout.log') -RedirectStandardError (Join-Path $runDirectory 'postgrest.stderr.log')
  & node (Join-Path $PSScriptRoot 'db-smoke-http.cjs') '--phase' 'before' '--base' "http://127.0.0.1:$HttpPort" '--secret-file' $secretFile '--run-dir' $runDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Pre-migration PostgREST relationship check failed.' }
  Invoke-SmokeSqlFile (Join-Path $repositoryPath $MigrationPath)
  Invoke-SmokeSqlFile (Join-Path $repositoryPath $MigrationPath)
  Save-ViewMetadata (Join-Path $runDirectory 'view-after.json')
  & node (Join-Path $PSScriptRoot 'db-smoke-http.cjs') '--phase' 'after' '--base' "http://127.0.0.1:$HttpPort" '--secret-file' $secretFile '--run-dir' $runDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Real PostgREST/RLS smoke failed.' }
  Write-Output "Local database proof passed: $runDirectory"
} finally {
  $env:Path = $originalProcessPath
  if ($postgrestProcess -and -not $postgrestProcess.HasExited) { Stop-Process -Id $postgrestProcess.Id -ErrorAction SilentlyContinue }
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    & (Join-Path $pgBin 'pg_ctl.exe') '-D' $dataDirectory '-m' 'fast' 'stop' *> $null
    if ($LASTEXITCODE -ne 0) { Stop-Process -Id $postgresProcess.Id -ErrorAction SilentlyContinue }
  }
}
