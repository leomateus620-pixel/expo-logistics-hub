/** Local QA proxy only. Not imported by Vite or any production component.
 * Adds 1.2 s latency and 30 KB/s per artwork response, plus 8 ms of main-thread
 * work per measured frame. This is a controlled load, not device/CPU emulation.
 * Run after `vite preview --port 8083`, then inspect localhost:8084/portal.
 */
import { createServer } from 'node:http';
const source = 'http://127.0.0.1:8083';
const sampler = `<script>
(() => {
  let start = 0, previous = 0, deltas = [], longTasks = [], mutations = 0, observed = false;
  const observer = new MutationObserver(() => { mutations++; });
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver(list => longTasks.push(...list.getEntries().filter(e => start && e.startTime >= start).map(e => e.duration))).observe({type:'longtask', buffered:true});
  }
  function frame(now) {
    const host = document.querySelector('[data-testid="portal-history"]');
    if (!observed && host) { observer.observe(host, {attributes:true}); observed = true; }
    if (!start && host?.dataset.running === 'true') { start = now; previous = now; longTasks = []; mutations = 0; }
    if (start) {
      if (now > previous) deltas.push(now - previous);
      previous = now;
      const work = performance.now();
      while (performance.now() - work < 8) {}
      if (now - start >= 30000) {
        deltas.sort((a,b)=>a-b);
        document.documentElement.dataset.portalProfile = JSON.stringify({
          durationMs: now-start, frames: deltas.length, medianFrameMs:deltas[Math.floor(deltas.length*.5)],
          p95FrameMs:deltas[Math.floor(deltas.length*.95)], maxFrameMs:deltas.at(-1),
          longTasksOver50Ms:longTasks.length, maximumLongTaskMs:Math.max(0,...longTasks),
          hostAttributeMutations:mutations, cpuWorkMsPerFrame:8, assetLatencyMs:1200,
          assetBytesPerSecondPerRequest:30720, width:innerWidth, height:innerHeight,
          artCount:host?.dataset.artCount, phase:host?.dataset.phase
        });
        observer.disconnect();
        return;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>`;
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, source);
    const upstream = await fetch(url);
    let bytes = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    if (type.includes('text/html')) bytes = Buffer.from(bytes.toString().replace('</body>', sampler + '</body>'));
    response.writeHead(upstream.status, {'Content-Type':type, 'Content-Length':bytes.length, 'Cache-Control':'no-store'});
    if (url.pathname.startsWith('/portal/history/')) {
      await new Promise(resolve => setTimeout(resolve,1200));
      for (let offset=0;offset<bytes.length;offset+=1024) {
        if (response.destroyed) return;
        response.write(bytes.subarray(offset,offset+1024));
        await new Promise(resolve => setTimeout(resolve,1000/30));
      }
      response.end();
    } else response.end(bytes);
  } catch { response.writeHead(502); response.end('Local QA preview unavailable'); }
}).listen(8084, '127.0.0.1', () => process.stdout.write('Controlled mobile QA: http://127.0.0.1:8084/portal\n'));
