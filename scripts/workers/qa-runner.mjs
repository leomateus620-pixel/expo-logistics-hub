/** Isolated real PostgreSQL (WASM) checks. No .env, production URL, network or project credentials. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = process.argv[process.argv.indexOf('--pglite-module') + 1];
if (!process.argv.includes('--pglite-module') || !modulePath || !path.isAbsolute(modulePath)) {
  throw new Error('Pass --pglite-module with the absolute path to a local @electric-sql/pglite/dist/index.js.');
}
const { PGlite } = await import(pathToFileURL(modulePath).href);
const database = new PGlite();
const files = [
  'scripts/workers/db-fixture.sql',
  'supabase/migrations/20261016120000_workers_readonly_workspace.sql',
  'supabase/migrations/20261016120100_workers_interest_scoped_reads.sql',
  'scripts/workers/rls-assertions.sql',
];
const results = [];
try {
  const version = await database.query('select version() as version');
  for (const filename of files) {
    const sql = await fs.readFile(path.join(repo, filename), 'utf8');
    const started = performance.now();
    const result = await database.exec(sql);
    results.push({ filename, sha256: crypto.createHash('sha256').update(sql).digest('hex'), passed: true,
      statements: result.length, milliseconds: Math.round(performance.now() - started) });
  }
  const report = {
    boundary: 'Fresh in-memory PostgreSQL WASM, synthetic identities and records only. Existing business RLS is represented by fixture helpers; this validates the new migrations, not the deployed business policies.',
    version: version.rows[0].version, passed: true, checks: results,
  };
  const output = path.join(repo, 'docs/workers/phase-0-1/rls-validation.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} catch (error) {
  console.error('Isolated workers RLS QA failed:', error.message);
  console.error('Completed fixture/migration steps:', results.map(result => result.filename));
  process.exitCode = 1;
} finally { await database.close(); }
