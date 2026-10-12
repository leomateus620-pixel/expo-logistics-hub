// No proxy, API, writes, external integrations or access to a source .env file.
// Listen on loopback by default; MAP_QA_HOST=0.0.0.0 explicitly enables LAN QA.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist-qa/constrained-devices');
const port = Number(process.env.MAP_QA_PORT || 4242);
const host = process.env.MAP_QA_HOST || '127.0.0.1';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('Build the isolated production QA fixture first');
const server = http.createServer((request, response) => {
  // The browser is also denied connections to Supabase, billing, push and other
  // hosts. Data is the existing in-memory official reference, never a live sale.
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'none'; form-action 'none'");
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://qa.local').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  response.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache');
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  let file = target;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/rest/')) {
      response.writeHead(404); response.end(); return;
    }
    file = path.join(root, 'index.html');
  }
  response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  response.writeHead(200);
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
});
server.listen(port, host, () => console.log(`Isolated read-only fixture: http://${host}:${port}/__dev/commercial-map-interface (Ctrl+C stops it)`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
