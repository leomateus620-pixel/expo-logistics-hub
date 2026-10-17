#!/usr/bin/env node
// Optional controlled Drizzle publication. No new environment variable or key.
// Default is a read-only inspection. Never prints connection URL or credentials.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { migrationLineEndingHashes } from './migration-hash.mjs';

const args=process.argv.slice(2);
const apply=args.includes('--apply');
const executor=args.includes('--executor')?args[args.indexOf('--executor')+1]:null;
if(executor && !['supabase','drizzle'].includes(executor))throw new Error('Use --executor supabase|drizzle');
if(apply && executor!=='drizzle')throw new Error('--apply requires explicit --executor drizzle. Supabase migrations use the established Supabase migration executor.');
const connection=process.env.LOVABLE_DB_MIGRATION_URL;
if(!connection){console.error('BLOCKED: existing LOVABLE_DB_MIGRATION_URL is unavailable; no database connection or change attempted.');process.exit(2);}
const schemaFile='drizzle/migrations/0018_workers_knowledge_base.sql';
const schemaText=await fs.readFile(schemaFile,'utf8');
const mirror=await fs.readFile('supabase/migrations/20261017070000_workers_knowledge_base.sql','utf8');
if(schemaText!==mirror)throw new Error('KB_SCHEMA_MIRROR_MISMATCH');
const schemaHash=createHash('sha256').update(schemaText).digest('hex');
const journal=JSON.parse(await fs.readFile('drizzle/migrations/meta/_journal.json','utf8'));
const item=journal.entries.find(entry=>entry.tag==='0018_workers_knowledge_base');
const previous=journal.entries.find(entry=>entry.idx===item?.idx-1);
if(!item || previous?.tag!=='0017_workers_identity_responses')throw new Error('KB_UNEXPECTED_MIGRATION_JOURNAL');
const priorHashes=migrationLineEndingHashes(await fs.readFile(`drizzle/migrations/${previous.tag}.sql`,'utf8'));
const manifest=JSON.parse(await fs.readFile('data/kb/manifest.json','utf8'));
// The local generator owns structural/count/hash verification; check never edits.
const check=spawnSync(process.execPath,['scripts/kb/build-kb-seed.mjs','--check'],{encoding:'utf8'});
if(check.status!==0){console.error('KB_BUILD_CHECK_FAILED');process.exit(check.status||1);}
const seedNames=(await fs.readdir('supabase/migrations')).filter(name=>/workers_kb_seed.*\.sql$/.test(name)).sort();
if(seedNames.length===0)throw new Error('KB_SEED_MISSING');
const seeds=await Promise.all(seedNames.map(async name=>{
  const text=await fs.readFile(`supabase/migrations/${name}`,'utf8');
  const version=text.match(/immutable revision ([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1];
  const sourceHash=text.match(/Source SHA-256: ([a-f0-9]{64})\./)?.[1];
  if(!version||!sourceHash)throw new Error('KB_INVALID_SEED_HEADER');
  return {name,text,version,sourceHash};
}));
const sql=postgres(connection,{max:1,prepare:false,onnotice:()=>{}});
try {
  const relations=(await sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text drizzle_history,to_regclass('public.__drizzle_migrations')::text public_drizzle_history,to_regclass('supabase_migrations.schema_migrations')::text supabase_history,to_regclass('public.kb_entries')::text kb_entries,to_regclass('workers_private.kb_seed_publications')::text publications`)[0];
  const historyName=relations.drizzle_history||relations.public_drizzle_history;
  const history=historyName?await sql.unsafe(`SELECT hash,created_at FROM ${historyName==='drizzle.__drizzle_migrations'?'drizzle.__drizzle_migrations':'public.__drizzle_migrations'} ORDER BY created_at DESC`):[];
  const supabaseApplied=relations.supabase_history?(await sql`SELECT version FROM supabase_migrations.schema_migrations WHERE version='20261017070000'`).length>0:false;
  const drizzleApplied=history.some(row=>Number(row.created_at)===item.when && row.hash===schemaHash);
  const publications=relations.publications?await sql`SELECT version::text,source_hash,entry_count,question_count FROM workers_private.kb_seed_publications ORDER BY version`:[];
  console.log(JSON.stringify({mode:apply?'apply':'check',requestedExecutor:executor,schema:{supabaseApplied,drizzleApplied,present:Boolean(relations.kb_entries)},publications,preparedSeeds:seedNames,reviewVersion:manifest.version??manifest.kb_version},null,2));
  if(!apply)process.exitCode=0;
  else {
    if(supabaseApplied)throw new Error('KB_EXECUTOR_MISMATCH: schema already belongs to Supabase history; continue with that executor, not Drizzle.');
    if(!historyName)throw new Error('KB_DRIZZLE_HISTORY_MISSING: do not invent or bootstrap legacy migration history.');
    if(history.some(row=>Number(row.created_at)===item.when && row.hash!==schemaHash))throw new Error('KB_APPLIED_SCHEMA_HASH_MISMATCH');
    if(!drizzleApplied){
      if(relations.kb_entries)throw new Error('KB_SCHEMA_WITHOUT_VERIFIED_HISTORY');
      if(Number(history[0]?.created_at)!==previous.when || !priorHashes.includes(history[0]?.hash))throw new Error('KB_PREDECESSOR_MISMATCH: expected verified 0017 before additive 0018.');
      // The source has its own BEGIN/COMMIT; strip only those exact outer lines,
      // then keep DDL and the Drizzle history insertion in one transaction.
      const body=schemaText.replace(/^BEGIN;\s*$/m,'').replace(/\nCOMMIT;\s*$/,'\n');
      await sql.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(20261017,70000)`;
        const latest=await tx.unsafe(`SELECT hash,created_at FROM ${historyName==='drizzle.__drizzle_migrations'?'drizzle.__drizzle_migrations':'public.__drizzle_migrations'} ORDER BY created_at DESC LIMIT 1 FOR UPDATE`);
        if(Number(latest[0]?.created_at)!==previous.when || !priorHashes.includes(latest[0]?.hash))throw new Error('KB_PREDECESSOR_CHANGED');
        await tx.unsafe(body);
        await tx.unsafe(`INSERT INTO ${historyName==='drizzle.__drizzle_migrations'?'drizzle.__drizzle_migrations':'public.__drizzle_migrations'}(hash,created_at) VALUES($1,$2)`,[schemaHash,item.when]);
      });
      console.log('Applied and recorded Drizzle 0018 atomically.');
    }
    for(const seed of seeds){
      // Each generated file validates ordering/hash and publishes atomically.
      // Seed history belongs exclusively to kb_seed_publications in this mode.
      const recorded=await sql`SELECT source_hash FROM workers_private.kb_seed_publications WHERE version=${seed.version}::date`;
      if(recorded.length){
        if(recorded[0].source_hash!==seed.sourceHash)throw new Error('KB_SEED_VERSION_IMMUTABLE');
        console.log(`Already published ${seed.name}; verified source hash.`);
        continue;
      }
      await sql.unsafe(seed.text);
      console.log(`Published ${seed.name}.`);
    }
  }
} catch(error){
  // Connection errors may contain sensitive host/user data. Emit only SQLSTATE
  // or our bounded error code; never the connection or arbitrary driver detail.
  const safe=String(error.message).match(/\bKB_[A-Z_]+\b/)?.[0];
  console.error(safe||`KB_DATABASE_OPERATION_FAILED${/^[A-Z0-9]{5}$/.test(error.code??'')?` (${error.code})`:''}`);
  process.exitCode=1;
} finally {await sql.end({timeout:5});}
