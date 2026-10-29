// Optional evidence-only packaging. Never changes product assets or image pixels.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const sharp=require(process.env.SHARP_MODULE||'sharp');
const root=path.resolve(process.argv[2]||'docs/validation/rural-coverage');
const archive=path.resolve(process.env.RURAL_QA_ARCHIVE||'/tmp/rural-coverage-full-evidence-2026-10-29');
if(fs.existsSync(path.join(root,'evidence-index.json')))throw Error('Evidence is already packaged; use a fresh output directory for another capture set.');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const names=new Set(['r59-close','r21-close','exporural-top','exporural-oblique','exporural-night','exporural-mobile','industry-roads-top','automotive-top','r59-mobile-touch']);
const directories=['baseline-medium','candidate-medium','functional','performance','performance-low'];
const entries=[];
(async()=>{
 for(const dir of directories){
  const folder=path.join(root,dir);if(!fs.existsSync(folder))continue;
  fs.mkdirSync(path.join(archive,dir),{recursive:true});
  for(const name of fs.readdirSync(folder)){
   const file=path.join(folder,name);if(!fs.statSync(file).isFile()||/\.(webp|gz)$/.test(name))continue;
   const bytes=fs.readFileSync(file),entry={path:dir+'/'+name,bytes:bytes.length,sha256:sha(bytes),archive:path.join(archive,dir,name)};
   fs.copyFileSync(file,entry.archive);
   if(name.endsWith('.png')){
    if(names.has(name.slice(0,-4))){
     const encoded=await sharp(bytes).webp({lossless:true,effort:6}).toBuffer(),target=file.replace(/\.png$/,'.webp');
     const original=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
     const decoded=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
     if(JSON.stringify(original.info)!==JSON.stringify(decoded.info)||!original.data.equals(decoded.data))throw Error('Lossless pixel verification failed: '+file);
     fs.writeFileSync(target,encoded);entry.versioned=dir+'/'+name.replace(/\.png$/,'.webp');
     entry.derived={bytes:encoded.length,sha256:sha(encoded),format:'WebP lossless',decodedPixelsSha256:sha(decoded.data),originalPixelsSha256:sha(original.data),pixelIdentical:true,info:decoded.info};
    }else entry.versioned=null;
    fs.unlinkSync(file);
   }else if(name==='report.json'&&dir!=='functional'){
    const encoded=zlib.gzipSync(bytes,{level:9});fs.writeFileSync(file+'.gz',encoded);fs.unlinkSync(file);entry.versioned=dir+'/'+name+'.gz';entry.gzipSha256=sha(encoded);
   }else if(dir.startsWith('performance')){entry.versioned=null;fs.unlinkSync(file);}
   else entry.versioned=dir+'/'+name;
   entries.push(entry);
  }
 }
 const index={archive,scope:'Original complete local captures and measurements; selected lossless WebP files and full aggregate report.json.gz are versioned. Every converted image has identical decoded RGBA bytes.',entries};
 fs.writeFileSync(path.join(root,'evidence-index.json'),JSON.stringify(index,null,2));
 console.log(JSON.stringify({entries:entries.length,converted:entries.filter(e=>e.derived).length,originalPngBytes:entries.filter(e=>e.derived).reduce((n,e)=>n+e.bytes,0),webpBytes:entries.filter(e=>e.derived).reduce((n,e)=>n+e.derived.bytes,0),archive},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
