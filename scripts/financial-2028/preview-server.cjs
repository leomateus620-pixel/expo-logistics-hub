// Serves the compiled local harness, with no API or write handlers.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(process.argv[2] || 'dist-qa/financial-2028');
const port = Number(process.argv[3] || 5195);
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
http.createServer((request,response)=>{
  const requested = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = path.resolve(directory, requested.startsWith('/comissoes/financeiro-gerencial') ? 'scripts/financial-2028/preview.html' : `.${requested}`);
  if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(response);
}).listen(port,'127.0.0.1',()=>console.log(`Local QA only: http://127.0.0.1:${port}`));
