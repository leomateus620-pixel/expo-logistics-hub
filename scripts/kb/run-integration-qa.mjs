/** Bundle the same matrix for local PGlite or loopback PostgreSQL 16. */
import { build } from 'esbuild';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
if (args.length !== 2 || !['--pg-module', '--pglite-module'].includes(args[0]) || !path.isAbsolute(args[1])) throw new Error('Use --pg-module or --pglite-module with exactly one absolute local module path.');
const temp = await mkdtemp(path.join(os.tmpdir(), 'fenasoja-kb-integration-'));
try {
  const output = path.join(temp, 'integration.mjs');
  await build({ entryPoints: ['scripts/kb/integration-qa.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', target: 'node22', logLevel: 'warning' });
  await import(pathToFileURL(output).href);
} finally {
  const resolved = await realpath(temp), expectedRoot = await realpath(os.tmpdir());
  if (path.dirname(resolved) !== expectedRoot || !path.basename(resolved).startsWith('fenasoja-kb-integration-')) throw new Error('Refusing cleanup outside the temporary integration directory.');
  await rm(resolved, { recursive: true, force: true });
}
