// Identical, opt-in instrumentation for immutable before/after production builds.
// Never injects authentication, data, controls, or renderer state.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const index = path.join(root, 'index.html');
const probe = `(() => {
  const report = { navigation: 0, fixture: location.pathname.includes('__dev'), viewport: [innerWidth,innerHeight,devicePixelRatio], userAgent:navigator.userAgent, events: {}, longTasks: [], resources: [] };
  const save = () => document.documentElement.dataset.previewPerformance = JSON.stringify(report);
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) { if(report.longTasks.length<300) report.longTasks.push([e.startTime,e.duration]); } }).observe({type:'longtask',buffered:true}); } catch {}
  const observer = new MutationObserver(() => {
    const canvas = document.querySelector('canvas[data-engine],canvas[data-commercial-map-render-health]') || document.querySelector('.commercial-map-stage canvas');
    if (!canvas) return;
    report.events.canvas ??= performance.now();
    const health = JSON.parse(canvas.dataset.commercialMapRenderHealth || '{}');
    if (health.presentedFrames > 0 && !report.events.draw) {
      report.events.draw = performance.now();
      requestAnimationFrame(() => {
        report.events.presentationOpportunity = performance.now();
        report.visible = !document.hidden; report.focused = document.hasFocus();
        report.health = health;
        report.resources = performance.getEntriesByType('resource').map(e => ({name:new URL(e.name).pathname,bytes:e.transferSize,duration:e.duration,start:e.startTime}));
        save(); observer.disconnect();
      });
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-commercial-map-render-health','data-engine']});
  document.addEventListener('pointerdown', () => { if(!report.events.draw || report.events.interaction) return; const start=performance.now(); report.events.interaction=start; requestAnimationFrame(() => {report.events.interactionOpportunity=performance.now();report.interactionMs=performance.now()-start;save();}); },{capture:true});
})();`;
let html = fs.readFileSync(index, 'utf8');
if (!html.includes('data-performance-preview')) html = html.replace('<head>', `<head><script data-performance-preview>${probe}</script>`);
fs.writeFileSync(index, html);
console.log(`Instrumented preview: ${root}`);
