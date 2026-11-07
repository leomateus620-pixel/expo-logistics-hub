import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const mediaRoot=path.resolve(__dirname,'../../public/memorial-voluntariado/art');
export default defineConfig({
  plugins:[react(),{name:'memorial-isolated-media-test',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url ?? '/', 'http://localhost');
      const mode=url.searchParams.get('qa-media');
      if (!mode || !url.pathname.startsWith('/memorial-voluntariado/art/')) return next();
      const target=path.resolve(mediaRoot,path.basename(url.pathname));
      if (!target.startsWith(mediaRoot+path.sep) || path.extname(target)!=='.webp') return next();
      if (mode==='fail') {res.statusCode=503;res.end('Diagnostic media failure');return;}
      if (mode!=='slow') return next();
      try {
        const bytes=await readFile(target);res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Length',bytes.length);
        // Controlled 128 KiB/s plus 500 ms latency. Not a physical-network claim.
        let offset=0;let timer:ReturnType<typeof setTimeout>;
        const send=()=>{res.write(bytes.subarray(offset,offset+16384));offset+=16384;if(offset>=bytes.length)res.end();else timer=setTimeout(send,125);};
        timer=setTimeout(send,500);res.on('close',()=>clearTimeout(timer));
      } catch {res.statusCode=404;res.end();}
    });
  }}],
  resolve:{alias:{'@':path.resolve(__dirname,'../../src')}},
  server:{host:'127.0.0.1',port:8089,strictPort:true},
});
