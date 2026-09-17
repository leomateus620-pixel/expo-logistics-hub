"""Read-only real-map evidence. Same viewport/poses before and after.
DEV-only camera/render pump; no replacement geometry and no production switch.
Software GPU runs are comparative samples, not physical mobile certification.
"""
import argparse, asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

POSES = {
 'sector-top': {'target':[29,0,-3.58],'position':[28.99,48,-3.58]},
 'roof-top': {'target':[38.12,0,-3.58],'position':[38.11,24,-3.58]},
 'front': {'target':[38.12,1.1,-3.58],'position':[21,4.4,-3.58]},
 'rear': {'target':[38.12,1.1,-3.58],'position':[55,4.4,-3.58]},
 'left': {'target':[38.12,1.1,-3.58],'position':[37,7,-21]},
 'right': {'target':[38.12,1.1,-3.58],'position':[37,7,14]},
 'oblique-1': {'target':[36,1,-3.58],'position':[21,15,11]},
 'oblique-2': {'target':[37,1,-3.58],'position':[25,17,-18]},
}
async def inspect(page):
 await page.evaluate("window.dispatchEvent(new CustomEvent('territory-qa',{detail:{inspectArena:true}}))")
 return await page.locator('canvas').evaluate("c=>JSON.parse(c.dataset.arenaInspection||'{}')")
async def main():
 p=argparse.ArgumentParser();p.add_argument('--base',default='http://127.0.0.1:4186');p.add_argument('--output',default='arena-validation/browser');p.add_argument('--phase',default='candidate');p.add_argument('--viewport',choices=['wide','desktop','mobile'],default='desktop');p.add_argument('--probe',action='store_true');a=p.parse_args()
 out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
 sizes={'wide':(1920,1080),'desktop':(1366,900),'mobile':(390,844)};w,h=sizes[a.viewport]
 report={'phase':a.phase,'viewport':[w,h],'softwareGPU':True,'views':{},'performance':[],'errors':[]}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=await browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=a.viewport=='mobile',has_touch=a.viewport=='mobile')
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  try:
   start=time.monotonic();await page.goto(a.base+'/__dev/commercial-map-rendering',wait_until='domcontentloaded',timeout=120000)
   await page.add_style_tag(content='''.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}''')
   await page.wait_for_function("document.querySelector('canvas')?.dataset.territoryQa==='ready'",timeout=120000)
   await page.evaluate("async()=>{const {useCommercialMapStore:s}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');window.__arenaStore=s;s.getState().setLabelsVisible(false)}")
   # Exercise normal demand rendering with a DEV-only invalidation pump. Do not
   # wait on unrelated interior/physics milestones after required layers finish.
   await page.evaluate("pose=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...pose,keepRendering:true}}))",POSES['sector-top'])
   ready=False
   for i in range(90):
    snap=await inspect(page);report['hydration']=snap
    (out/f'{a.phase}-{a.viewport}-progress.json').write_text(json.dumps(report,indent=2))
    marks=snap.get('boot',{}).get('marks',{})
    if all('hydrate:'+x+':end' in marks for x in ['arena-context','vegetation','site-context']):ready=True;break
    await page.wait_for_timeout(1000)
   if not ready:raise AssertionError('Required Arena/environment layers not hydrated; see progress report')
   report['hydratedMs']=round((time.monotonic()-start)*1000)
   if a.probe:
    await page.screenshot(path=str(out/f'{a.phase}-probe.png'));return
   for name,pose in POSES.items():
    await page.evaluate("pose=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:pose}))",pose);await page.wait_for_timeout(1800)
    await page.screenshot(path=str(out/f'{a.phase}-{a.viewport}-{name}.png'))
    report['views'][name]=await inspect(page)
   # Same navigation sample 3 times; no quality/scene masking in measurement.
   for i in range(3):
    await page.evaluate("pose=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...pose,measure:true}}))",POSES['oblique-1']);await page.wait_for_timeout(7800)
    report['performance'].append(await page.locator('canvas').evaluate("c=>JSON.parse(c.dataset.territoryReport||'{}')"))
   for reduced in [True,False,True,False]:
    await page.evaluate('v=>window.__arenaStore.getState().setReducedGraphics(v)',reduced);await page.wait_for_timeout(1200)
   await page.evaluate('window.__arenaStore.getState().setNightModeActive(true)');await page.wait_for_timeout(2200)
   await page.screenshot(path=str(out/f'{a.phase}-{a.viewport}-night.png'))
   report['finalHealth']=await page.locator('canvas').evaluate("c=>JSON.parse(c.dataset.commercialMapRenderHealth||'{}')")
   report['horizontalOverflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   if report['errors'] or report['finalHealth'].get('status')!='ready' or report['horizontalOverflow']:raise AssertionError('Errors, overflow or unhealthy renderer')
   report['status']='passed'
  except Exception as e:
   report.update(status='failed',error=str(e));report['datasets']=await page.locator('canvas').evaluate_all('(els)=>els.map(c=>({...c.dataset}))');await page.screenshot(path=str(out/f'{a.phase}-{a.viewport}-failure.png'));raise
  finally:
   (out/f'{a.phase}-{a.viewport}-runtime.json').write_text(json.dumps(report,indent=2));await browser.close()
if __name__=='__main__':asyncio.run(main())
