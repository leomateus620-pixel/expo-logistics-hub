/** Exercises immutable generation and invalid-input rejection in an isolated temporary copy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fenasoja-kb-generator-test-'));
const results=[];
const fingerprint=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try {
 fs.cpSync(path.join(root,'data/kb'),path.join(temp,'data/kb'),{recursive:true});
 for(const folder of ['scripts/kb','supabase/functions/_shared/workers','supabase/migrations'])fs.mkdirSync(path.join(temp,folder),{recursive:true});
 for(const name of ['build-kb-seed.mjs','normalize-kb.mjs'])fs.copyFileSync(path.join(root,'scripts/kb',name),path.join(temp,'scripts/kb',name));
 for(const name of ['contracts.ts','kb-source.ts','kb-editions.ts','kb-policies.ts','kb-normalization.ts'])fs.copyFileSync(path.join(root,'supabase/functions/_shared/workers',name),path.join(temp,'supabase/functions/_shared/workers',name));
 const manifest=JSON.parse(fs.readFileSync(path.join(temp,'data/kb/manifest.json'),'utf8'));
 const seed=path.join(temp,manifest.outputs.find(o=>o.name.includes('workers_kb_seed')).name);
 fs.copyFileSync(path.join(root,path.relative(temp,seed)),seed);
 const initialHash=fingerprint(seed),initialMtime=fs.statSync(seed).mtimeMs;
 const run=(name,args,expect='')=>{
  const output=spawnSync(process.execPath,['scripts/kb/build-kb-seed.mjs',...args],{cwd:temp,encoding:'utf8'});
  const passed=expect ? output.status!==0&&`${output.stdout}${output.stderr}`.includes(expect) : output.status===0;
  if(!passed)throw new Error(`${name}: ${output.stdout}${output.stderr}`);
  results.push({name,result:'PASS'});
 };
 const generation=['--stamp',manifest.migration_stamp,'--version',manifest.version];
 run('reproducible outputs',['--check']);run('identical regeneration',generation);
 if(fingerprint(seed)!==initialHash||fs.statSync(seed).mtimeMs!==initialMtime)throw new Error('Existing migration was rewritten');
 results.push({name:'identical migration bytes and mtime preserved',result:'PASS'});
 run('downgrade rejected',['--stamp','20261018080000','--version','2026-10-16'],'KB_SEED_VERSION_DOWNGRADE');
 run('old timestamp rejected',['--stamp','20261016080000','--version',manifest.version],'KB_SEED_STAMP_NOT_AFTER_HISTORY');
 const dataFile=path.join(temp,'data/kb/fenasoja-kb.json'),baseline=fs.readFileSync(dataFile,'utf8');
 const mutate=(name,fn,expect)=>{const doc=JSON.parse(baseline);fn(doc);fs.writeFileSync(dataFile,JSON.stringify(doc));run(name,generation,expect);fs.writeFileSync(dataFile,baseline);};
 mutate('published version cannot be silently rewritten',d=>{d.entries[0].answer+=' Revisão editorial.';},'KB_MIGRATION_IMMUTABLE');
 mutate('entry count mismatch rejected',d=>{d.entries.pop();},'KB_SEED_COUNT_MISMATCH');
 mutate('empty normalized question rejected',d=>{d.entries[0].variants[0]='!!!';},'empty normalized question');
 mutate('unsafe source rejected',d=>{d.entries[0].sources[0].url='https://127.0.0.1/private';},'unsafe URL');
 mutate('invalid source date rejected',d=>{d.entries[0].sources[0].accessed='2026-02-30';},'invalid civil access date');
 mutate('redaction changes rejected',d=>{d.entries[0].answer='Contato: pessoa@example.com';},'redactWorkerText changes reviewed text');
 mutate('public notes exceeding complete response budget rejected',d=>{d.entries[0].public_notes=['Primeira ressalva.','Segunda ressalva.','Terceira ressalva.','Quarta ressalva.'];},'KB_PUBLIC_NOTES_BUDGET_EXCEEDED');
 mutate('initial question occurrences protected',d=>{d.entries[0].variants[0]=d.entries[1].canonical_question;},'initial question occurrences must be preserved');
 mutate('entry provenance revision protected',d=>{d.entries[0].provenance.revision='2026-10-16';},'provenance revision mismatch');
 for(const [file,mutations]of [
  ['curation-log.json',[
   ['editorial reason required',d=>{d.changes[0].reason='';},'editorial reason required'],
   ['editorial previous value required',d=>{delete d.changes[0].previous;},'previous and revised values required'],
   ['editorial ID validated',d=>{d.changes[0].id='UNKNOWN-ID';},'unknown entry ID'],
   ['editorial evidence date validated',d=>{d.changes[0].source={url:'https://fenasoja.com.br/',reviewed_on:'2026-02-30'};},'invalid evidence review date'],
  ]],
  ['raw/provenance.json',[
   ['raw provenance revision protected',d=>{d.revision='2026-10-16';},'Raw provenance revision must match'],
  ]],
 ]){
  const target=path.join(temp,'data/kb',file),original=fs.readFileSync(target,'utf8');
  for(const [name,fn,expect]of mutations){const doc=JSON.parse(original);fn(doc);fs.writeFileSync(target,JSON.stringify(doc));run(name,generation,expect);fs.writeFileSync(target,original);}
 }
 const policyFile=path.join(temp,'data/kb/query-policies.json'),policyBaseline=fs.readFileSync(policyFile,'utf8');
 const policy=JSON.parse(policyBaseline);policy.collisions.pop();fs.writeFileSync(policyFile,JSON.stringify(policy));
 run('unreviewed collision rejected',generation,'missing collision group');fs.writeFileSync(policyFile,policyBaseline);
 if(fingerprint(seed)!==initialHash)throw new Error('Negative test altered immutable migration');
 console.log(JSON.stringify({environment:`Node ${process.version}; isolated temporary copy`,tests:results},null,2));
} finally {
 const resolved=fs.realpathSync(temp),expectedRoot=fs.realpathSync(os.tmpdir());
 if(path.dirname(resolved)!==expectedRoot||!path.basename(resolved).startsWith('fenasoja-kb-generator-test-'))throw new Error('Refusing cleanup outside the test directory');
 fs.rmSync(resolved,{recursive:true,force:true});
}
