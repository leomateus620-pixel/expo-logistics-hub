const fs = require('node:fs');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const baseline = process.argv[2] || 'bb82eefb04b2685890e2e999f656ececf511a992';
const hash = value => crypto.createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
const files = execFileSync('git',['ls-tree','-r','--name-only',baseline],{encoding:'utf8'}).trim().split('\n')
  .filter(file => /^src\/features\/commercial-map\/data\//.test(file)
    && !['commercialTrees.ts','parkAccessEnvironment.ts'].some(name => file.endsWith('/'+name)));
const sources = files.map(file => {
  const before = hash(execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:20*1024*1024}));
  const after = hash(fs.readFileSync(file,'utf8'));
  return {file,before,after,unchanged:before===after};
});
const report = {baseline,scope:'Tracked reference, commercial inventory, prices and cadastral geometry sources; LF normalized. Tree placement and access-filter implementation excluded and validated separately. No production/database audit.',
  sources,unchanged:sources.every(s=>s.unchanged)};
fs.mkdirSync('docs/validation/access-spatial-correction',{recursive:true});
fs.writeFileSync('docs/validation/access-spatial-correction/source-preservation.json',JSON.stringify(report,null,2));
if(!report.unchanged)throw new Error('Protected reference source changed');
console.log(JSON.stringify({baseline,protectedSources:sources.length,unchanged:report.unchanged}));
