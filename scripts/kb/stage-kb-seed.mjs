#!/usr/bin/env node
/**
 * Stages the reviewed KB seed into workers_private.kb_seed_stage_parts in parts.
 * Uses the ambient psql environment (no URL, no new credentials). Idempotent:
 * already staged parts are skipped; every part is hash-checked here and by the
 * database trigger. Publication only happens via kb_promote_staged_seed.
 * Usage: node scripts/kb/stage-kb-seed.mjs [--check] [--version YYYY-MM-DD]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const version = args.includes('--version') ? args[args.indexOf('--version') + 1] : JSON.parse(fs.readFileSync('data/kb/manifest.json', 'utf8')).version;
if (!/^\d{4}-\d{2}-\d{2}$/.test(version ?? '')) throw new Error('Invalid --version');
const index = JSON.parse(fs.readFileSync(`data/kb/seed-parts/${version}.json`, 'utf8'));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const seed = fs.readFileSync(index.seed, 'utf8');
if (sha(seed) !== index.seed_sha256) throw new Error('KB_SEED_FILE_HASH_MISMATCH');
const parts = seed.split('\n\n');
if (parts.length !== index.part_count) throw new Error('KB_SEED_PART_COUNT_MISMATCH');
parts.forEach((p, i) => { if (sha(p) !== index.parts[i].sha256 || index.parts[i].part_no !== i + 1) throw new Error(`KB_SEED_PART_HASH_MISMATCH ${i + 1}`); });
if (parts.join('\n\n') !== seed) throw new Error('KB_SEED_PART_JOIN_MISMATCH');

const psql = (sql, input) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-At', ...(input === undefined ? ['-c', sql] : ['-f', '-'])], { input, encoding: 'utf8', maxBuffer: 64 << 20 });
const staged = new Map(psql(`SELECT part_no, part_sha256 FROM workers_private.kb_seed_stage_parts WHERE version='${version}' AND seed_sha256='${index.seed_sha256}' AND part_count=${index.part_count}`)
  .trim().split('\n').filter(Boolean).map(l => l.split('|')).map(([n, h]) => [Number(n), h]));
for (const [n, h] of staged) if (index.parts[n - 1]?.sha256 !== h) throw new Error(`KB_SEED_STAGED_PART_DIVERGES ${n}`);
let inserted = 0;
if (!checkOnly) for (const [i, body] of parts.entries()) {
  const n = i + 1;
  if (staged.has(n)) continue;
  let tag = 'kbpart'; while (body.includes(`$${tag}$`)) tag += 'x';
  psql(null, `INSERT INTO workers_private.kb_seed_stage_parts(version,seed_sha256,part_count,part_no,part_sha256,body) VALUES ('${version}','${index.seed_sha256}',${index.part_count},${n},'${index.parts[i].sha256}',$${tag}$${body}$${tag}$) ON CONFLICT DO NOTHING;\n`);
  inserted++;
}
console.log(JSON.stringify({ version, seed_sha256: index.seed_sha256, part_count: index.part_count, previously_staged: staged.size, inserted, check_only: checkOnly,
  promote: `SELECT workers_private.kb_promote_staged_seed('${version}'::date,'${index.seed_sha256}',${index.part_count},'${index.source_hash}');` }));
