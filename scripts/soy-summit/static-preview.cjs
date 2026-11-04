// Local production-build comparison server; never changes application routing.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(process.argv[2]||'dist'),port=Number(process.argv[3]||8083);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const transfers=[];
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/__soy_qa_stats'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({bodyBytes:transfers.reduce((sum,t)=>sum+t.bytes,0),transfers}));}
  let file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
  const type=types[path.extname(file)]||'application/octet-stream';
  let body=fs.readFileSync(file);const headers={'Content-Type':type,'Cache-Control':'no-store'};
  if(/text|json|svg/.test(type)&&req.headers['accept-encoding']?.includes('gzip')){body=zlib.gzipSync(body);headers['Content-Encoding']='gzip';}
  headers['Content-Length']=body.length;res.writeHead(200,headers);
  res.on('finish',()=>transfers.push({path:pathname,method:req.method,bytes:req.method==='HEAD'?0:body.length}));
  res.end(req.method==='HEAD'?undefined:body);
}).listen(port,'127.0.0.1',()=>console.log(`Production comparison: http://127.0.0.1:${port}`));
