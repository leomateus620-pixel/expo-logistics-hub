#!/usr/bin/env node
/**
 * Local QA (PGlite, simulated claims): staged-part publication must produce exactly
 * the same rows as the monolithic reviewed seed, be resumable, reject corrupt or
 * incomplete parts without publishing, and keep the downgrade guard.
 * Usage: node scripts/kb/test-kb-staged-seed.mjs --pglite-module /abs/path/pglite/dist/index.js
 */
import fs from 'node:fs';
import { createKbTestDb } from './db-fixture.mjs';

const args = process.argv.slice(2);
const runtime = args[args.indexOf('--pglite-module') + 1];
if (!runtime) throw new Error('Pass --pglite-module');
const staging = fs.readFileSync(args.includes('--staging-sql') ? args[args.indexOf('--staging-sql') + 1] : 'scripts/kb/staging/kb_seed_staging.sql', 'utf8');
const index = JSON.parse(fs.readFileSync('data/kb/seed-parts/2026-10-17.json', 'utf8'));
const parts = fs.readFileSync(index.seed, 'utf8').split('\n\n');
const results = [];
const ok = (name, cond) => { results.push({ name, ok: !!cond }); if (!cond) console.error('FAIL', name); };
const q = (s) => s.replaceAll("'", "''");
const insertPart = (db, i, body = parts[i], hash = index.parts[i].sha256) => db.exec(`INSERT INTO workers_private.kb_seed_stage_parts(version,seed_sha256,part_count,part_no,part_sha256,body) VALUES ('2026-10-17','${index.seed_sha256}',${index.part_count},${i + 1},'${hash}','${q(body)}') ON CONFLICT DO NOTHING`);
const promote = db => db.query(`SELECT workers_private.kb_promote_staged_seed('2026-10-17'::date,'${index.seed_sha256}',${index.part_count},'${index.source_hash}') r`);
const digest = async db => (await db.query(`SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) h FROM (SELECT id,kb,area,area_name,subcategory,canonical_question,answer,kind,status,as_of,edition_number,edition_year,citation_template,sources,tags,related_ids,fenasoja_links,gaps,relevance,priority,kb_version,context,public_notes,query_policy,editorial_metadata,provenance,managed_by FROM public.kb_entries) t`)).rows[0].h
  + ':' + (await db.query(`SELECT md5(string_agg(row_to_json(t)::text, '|' ORDER BY id)) h FROM (SELECT id,entry_id,kb,question,question_norm,is_canonical,kb_version FROM public.kb_questions) t`)).rows[0].h;
const rejects = async (fn, code) => { try { await fn(); return false; } catch (e) { return String(e.message).includes(code); } };

const mono = await createKbTestDb(runtime);
const monoDigest = await digest(mono);
await mono.close();

const db = await createKbTestDb(runtime, { seed: false });
await db.exec(staging);
ok('corrupt part rejected by trigger', await rejects(() => insertPart(db, 0, parts[0] + ' ', index.parts[0].sha256), 'KB_SEED_PART_HASH_MISMATCH'));
for (let i = 0; i < parts.length - 1; i++) await insertPart(db, i);
ok('incomplete stage refuses promotion', await rejects(() => promote(db), 'KB_SEED_STAGE_INCOMPLETE'));
ok('nothing published while incomplete', (await db.query('SELECT count(*)::int n FROM public.kb_entries')).rows[0].n === 0);
for (let i = 0; i < parts.length; i++) await insertPart(db, i); // resumable/idempotent
ok('all parts staged once', (await db.query('SELECT count(*)::int n FROM workers_private.kb_seed_stage_parts')).rows[0].n === index.part_count);
const r = (await promote(db)).rows[0].r;
ok('promotion returns counts', r.entries === 2786 && r.questions === 12134);
const counts = (await db.query(`SELECT kb, count(*)::int e, (SELECT count(*)::int FROM public.kb_questions q WHERE q.kb=e.kb) q FROM public.kb_entries e GROUP BY kb ORDER BY kb`)).rows;
ok('fenasoja 372/1245', counts.find(c => c.kb === 'fenasoja')?.e === 372 && counts.find(c => c.kb === 'fenasoja')?.q === 1245);
ok('expandida 2414/10889', counts.find(c => c.kb === 'expandida')?.e === 2414 && counts.find(c => c.kb === 'expandida')?.q === 10889);
ok('identical rows to monolithic seed', (await digest(db)) === monoDigest);
const pub = (await db.query(`SELECT version::text v, source_hash, entry_count, question_count FROM workers_private.kb_seed_publications`)).rows;
ok('publication registered', pub.length === 1 && pub[0].v === '2026-10-17' && pub[0].source_hash === index.source_hash && pub[0].entry_count === 2786 && pub[0].question_count === 12134);
ok('staging cleared after promotion', (await db.query('SELECT count(*)::int n FROM workers_private.kb_seed_stage_parts')).rows[0].n === 0);
for (let i = 0; i < parts.length; i++) await insertPart(db, i);
await promote(db);
ok('re-promotion is idempotent', (await digest(db)) === monoDigest && (await db.query('SELECT count(*)::int n FROM workers_private.kb_seed_publications')).rows[0].n === 1);
await db.exec(`INSERT INTO workers_private.kb_seed_publications(version,source_hash,entry_count,question_count) VALUES ('2026-12-01','${'0'.repeat(64)}',1,1)`);
for (let i = 0; i < parts.length; i++) await insertPart(db, i);
ok('downgrade blocked', await rejects(() => promote(db), 'KB_SEED_VERSION_DOWNGRADE'));
ok('rows unchanged after failed promotion', (await digest(db)) === monoDigest);
await db.close();
console.log(JSON.stringify({ engine: 'pglite (local, simulated claims)', results }, null, 1));
if (results.some(x => !x.ok)) process.exit(1);
