/* Isolated real PostgreSQL/PostgREST QA. Never reads .env or a project database URL. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const pgBin = option('--pg-bin');
const postgrestBin = option('--postgrest');
assert(pgBin && path.isAbsolute(pgBin), 'Pass --pg-bin pointing to a local PostgreSQL bin directory.');
const output = path.resolve(option('--output') ?? 'docs/validation/financial-expenses-comparison');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-expenses-qa-'));
const data = path.join(runtime, 'data');
const database = 'financial_expenses_qa';
const port = '5499';
const repo = path.resolve(__dirname, '../..');
const pgEnv = { ...process.env, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5',
  DYLD_LIBRARY_PATH: path.resolve(pgBin, '../lib') };
const connection = ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', port, '-U', 'postgres'];
fs.mkdirSync(output, { recursive: true });
let started = false, rest, gateway, closing = false;
function run(binary, commandArgs, input) {
  const result = spawnSync(binary, commandArgs, { input, encoding: 'utf8', env: pgEnv, maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}
const psql = path.join(pgBin, 'psql');
const sql = (text, db = database) => run(psql, [...connection, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', '-'], text);
const migrations = [
  'scripts/financial-2028/expenses-db-fixture.sql',
  'supabase/migrations/20261006200356_8633880e-2e4d-4354-bc01-53a604dfe92d.sql',
  'drizzle/migrations/0004_financial_expenses_2028_stage1.sql',
  'drizzle/migrations/0005_financial_category_audit_entity_fix.sql',
];
function bootstrap() {
  sql(`CREATE DATABASE ${database};`, 'postgres');
  for (const filename of migrations) {
    const result = spawnSync(psql, [...connection, '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', path.join(repo, filename)],
      { encoding: 'utf8', env: pgEnv, maxBuffer: 10 * 1024 * 1024 });
    fs.appendFileSync(path.join(output, 'database-bootstrap.log'), `${filename}\n${result.stdout}${result.stderr}\n`);
    if (result.status !== 0) throw new Error(`Fixture/migration failed: ${filename}: ${result.stderr}`);
  }
}
function stop() {
  if (closing) return;
  closing = true;
  gateway?.close();
  rest?.kill('SIGTERM');
  if (started) {
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { env: pgEnv, encoding: 'utf8' });
    started = false;
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(0); });
process.on('exit', stop);
(async () => {
  run(path.join(pgBin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  run(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(runtime, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${runtime}`, '-w', 'start']);
  started = true;
  bootstrap();
  run(process.execPath, [path.join(__dirname, 'expenses-db-qa.cjs'), '--psql', psql, '--port', port, '--output', output]);
  console.log(JSON.stringify({ databaseChecks: JSON.parse(fs.readFileSync(path.join(output, 'authenticated-database-report.json'), 'utf8')).summary }));
  // Discard the test database, then create a fresh browser fixture in the same isolated cluster.
  sql(`DROP DATABASE ${database};`, 'postgres');
  bootstrap();
  const seedScript = option('--seed-script') ? path.resolve(option('--seed-script')) : path.join(__dirname, 'expenses-db-seed.cjs');
  run(process.execPath, [seedScript, '--psql', psql, '--port', port, '--output', output]);
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify({
    boundary: 'Fresh synthetic loopback PostgreSQL cluster; no production connection or credentials.',
    postgres: run(path.join(pgBin, 'postgres'), ['--version']), database, port,
    runtime, migrations: migrations.map(filename => ({ filename,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, filename))).digest('hex') })),
  }, null, 2));
  if (!args.includes('--serve')) { stop(); console.log('Authenticated database QA passed; isolated cluster stopped.'); return; }
  assert(postgrestBin && path.isAbsolute(postgrestBin), '--serve requires --postgrest with a local binary.');
  const postgrestVersion = run(postgrestBin, ['--version']);
  assert(Number(postgrestVersion.match(/PostgREST (\d+)/)?.[1]) >= 16,
    'Use PostgREST 16+: earlier versions retry custom SQLSTATE 40001 conflicts indefinitely.');
  const runtimeMetadata = JSON.parse(fs.readFileSync(path.join(output, 'runtime.json'), 'utf8'));
  fs.writeFileSync(path.join(output, 'runtime.json'), JSON.stringify({ ...runtimeMetadata, postgrest: postgrestVersion }, null, 2));
  const secret = crypto.randomBytes(48).toString('hex');
  const config = path.join(runtime, 'postgrest.conf');
  fs.writeFileSync(config, `db-uri = "postgresql://qa_authenticator:financial-expenses-local-only@127.0.0.1:${port}/${database}"\n` +
    `db-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = 5581\njwt-secret = "${secret}"\n`);
  const restLog = fs.openSync(path.join(runtime, 'postgrest.log'), 'a');
  rest = spawn(postgrestBin, [config], { env: pgEnv, stdio: ['ignore', restLog, restLog] });
  rest.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; });
  const jwt = payload => {
    const content = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400 })).toString('base64url')].join('.');
    return `${content}.${crypto.createHmac('sha256', secret).update(content).digest('base64url')}`;
  };
  const profiles = { admin: '10000000-0000-0000-0000-000000000001', reader: '10000000-0000-0000-0000-000000000002',
    editor: '10000000-0000-0000-0000-000000000003', confirmer: '10000000-0000-0000-0000-000000000004',
    denied: '10000000-0000-0000-0000-000000000005' };
  gateway = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:5580');
    if (url.pathname === '/qa/session') {
      const profile = url.searchParams.get('profile') ?? 'admin';
      if (!profiles[profile]) { response.writeHead(400).end('Unknown local QA profile.'); return; }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ boundary: 'LOCAL SYNTHETIC QA ONLY', profile, userId: profiles[profile],
        orgId: 'a0000000-0000-0000-0000-000000000001', anonKey: jwt({ role: 'anon' }),
        accessToken: jwt({ role: 'authenticated', sub: profiles[profile] }) }));
      return;
    }
    if (!url.pathname.startsWith('/rest/v1/')) { response.writeHead(404).end(); return; }
    const proxy = http.request({ hostname: '127.0.0.1', port: 5581, method: request.method,
      path: url.pathname.replace('/rest/v1', '') + url.search, headers: request.headers }, upstream => {
      response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response);
    });
    proxy.on('error', () => response.writeHead(503).end('Local PostgREST unavailable.'));
    request.pipe(proxy);
  });
  await new Promise(resolve => gateway.listen(5580, '127.0.0.1', resolve));
  console.log(JSON.stringify({ ready: true, database, gateway: 'http://127.0.0.1:5580',
    preview: 'http://127.0.0.1:5184/comissoes/financeiro-gerencial/despesas-previstas?edicao=2028&profile=admin',
    profiles: Object.keys(profiles), runtime }));
})().catch(error => { console.error(error.message); stop(); process.exitCode = 1; });
