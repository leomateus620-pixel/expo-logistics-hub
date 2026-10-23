// Optional external reproduction harness. This delivery's browser evidence was
// collected through Codex's connected browser, not by invoking this script.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8089';
const output = process.argv[3] || 'artifacts/alvorada/interactions';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name, viewport] of [['desktop', { width:1440,height:900 }], ['mobile', { width:390,height:844 }], ['landscape', { width:844,height:390 }]]) {
  const context = await browser.newContext({ viewport, reducedMotion:'reduce' });
  const page = await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/scripts/alvorada-qa.html?graph`);
  await page.locator('.org-ecosystem__ready').waitFor();
  const graph=await page.evaluate(()=>window.__alvoradaQaGraph);
  const president=graph.nodes.find(n=>n.metadata.executiveRole?.includes('president'));
  const vice=graph.nodes.find(n=>n.metadata.executiveRole?.includes('vice-president'));
  const central=graph.nodes.find(n=>n.type==='central-commission');
  assert.deepEqual(president.parentIds,[graph.rootNodeId]);assert.deepEqual(vice.parentIds,[president.id]);assert.deepEqual(central.parentIds,[vice.id]);
  assert.equal(graph.edges.some(e=>e.sourceId===graph.rootNodeId&&e.targetId===vice.id),false);
  assert.equal(await page.locator('.org-filters button').count(),6);
  assert.equal(await page.getByRole('searchbox').count(),0);
  const audit=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.org-node')];const upper=nodes.filter(n=>n.dataset.horizontal);
    const rings=upper.map(n=>n.querySelector('.org-node__ring').getBoundingClientRect());
    const footer=document.querySelector('.org-bottom-bar').getBoundingClientRect();
    const boxes=nodes.flatMap(n=>[n.querySelector('.org-node__ring'),n.querySelector('.org-node__copy')].map(e=>e.getBoundingClientRect()));
    return {centers:rings.map(r=>r.x+r.width/2),tops:rings.map(r=>r.top),inside:boxes.every(r=>r.left>=0&&r.right<=innerWidth+.5&&r.top>=0&&r.bottom<footer.top+.5),scroll:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight};
  });
  assert.equal(audit.inside,true);assert.equal(audit.scroll,true);assert.ok(Math.max(...audit.centers)-Math.min(...audit.centers)<1);
  assert.deepEqual(audit.tops,[...audit.tops].sort((a,b)=>a-b));
  await page.screenshot({path:path.join(output,`${name}-overview.png`)});
  if(await page.locator('.org-node[data-group]').count()) await page.locator('.org-node[data-group]').first().locator('button').click();
  const seen=new Set();
  do {
    (await page.locator('.org-node[data-authority="4"]').evaluateAll(ns=>ns.map(n=>n.dataset.nodeId))).forEach(id=>seen.add(id));
    const next=page.getByRole('button',{name:'Próxima',exact:true});
    if(!await next.count()||!await next.isEnabled()) break;
    await next.click();
  }while(true);
  assert.ok(seen.size>0);
  const person=page.locator('.org-node[data-authority="4"] button').first();const origin=await person.getAttribute('aria-label');
  const camera=await page.locator('.org-viewport__world').getAttribute('style');
  await person.click();await page.getByRole('button',{name:'Fechar detalhes',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),origin);
  assert.equal(await page.locator('.org-viewport__world').getAttribute('style'),camera);
  await page.evaluate(()=>window.__alvoradaQaRefresh());
  assert.equal(await page.locator('.org-viewport__world').getAttribute('style'),camera);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,`${name}-audit.json`),JSON.stringify({viewport,audit,reachableUnits:seen.size,errors},null,2));
  await context.close();
}
await browser.close();
