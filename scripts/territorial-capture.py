"""Real map, fixed quality, identical poses before/after. No commercial writes.
Linux software GPU / emulated mobile are not physical-device certification.
"""
import argparse, asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright


def local(x, z):
    return ((x-600)/5500*120-60, (z-900)/4150*90.545455-90.545455/2)


def views():
    result = {}
    for label, source, yaw in [('test-drive', (917.5,2972.5), 0), ('pecuaria', (2925,2525), -1.5707963267948966)]:
        import math
        x,z = local(*source)
        for name, offset in [('front',(2,1.65,7.8)),('long-side',(8,2.6,1.4)),('rear',(-2,2.4,-8)),('oblique',(6,6.5,7)),('top',(.01,11,0))]:
            ox,y,oz=offset
            result[f'{label}-{name}']={'target':[x,.35,z], 'position':[x+ox*math.cos(yaw)+oz*math.sin(yaw),y,z-ox*math.sin(yaw)+oz*math.cos(yaw)]}
    result['access-top']={'target':[-56,0,22], 'position':[-55.99,41,22]}
    result['gate1-top']={'target':[-64,0,18], 'position':[-63.99,23,18]}
    result['main-roundabout-top']={'target':[-48.9,0,26.4], 'position':[-48.89,22,26.4]}
    result['access-oblique']={'target':[-55,0,22], 'position':[-75,19,44]}
    for label, source, distance in [('parking', (5250,3800),28),('pavilion-court',(2670,3890),17)]:
        x,z=local(*source)
        result[f'{label}-top']={'target':[x,0,z],'position':[x+.01,distance,z]}
        result[f'{label}-oblique']={'target':[x,0,z],'position':[x+distance*.5,distance*.6,z+distance*.65]}
    return result

async def event(page, detail):
    await page.evaluate('detail=>window.dispatchEvent(new CustomEvent("territory-qa",{detail}))',detail)

async def run(browser, base, out, name, size):
    context=await browser.new_context(viewport=size,device_scale_factor=1,is_mobile=name=='mobile',has_touch=name=='mobile')
    page=await context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    report={'viewport':size,'browser':browser.version,'softwareGPU':True,'errors':errors,'views':{},'metrics':[]}
    out.mkdir(parents=True,exist_ok=True)
    try:
        start=time.monotonic()
        await page.goto(base+'/__dev/commercial-map-rendering?quality=fixed',wait_until='domcontentloaded',timeout=120000)
        await page.add_style_tag(content='''
          .commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,
          .commercial-map-rendering-diagnostics__metrics,.commercial-map-label{display:none!important}
          .commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}
        ''')
        await page.wait_for_function("document.querySelector('canvas')?.dataset.territoryQa==='ready'",timeout=180000)
        await page.evaluate("async()=>{window.__territorialStore=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;window.__territorialStore.getState().setLabelsVisible(false)}")
        await event(page,{'keepRendering':True})
        await page.wait_for_function("document.querySelector('canvas')?.dataset.commercialMapHydration==='complete'",timeout=180000)
        await page.wait_for_function("JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready'",timeout=180000)
        report['hydratedMs']=(time.monotonic()-start)*1000
        await page.wait_for_timeout(5000)
        canvas=page.locator('.commercial-map-rendering-diagnostics__viewport canvas')
        for label,pose in views().items():
            await event(page,{**pose,'keepRendering':True})
            await page.wait_for_timeout(1300)
            await page.screenshot(path=str(out/f'{label}.png'))
            await event(page,{'inspectSpatial':True})
            report['views'][label]=await canvas.evaluate("c=>({pose:JSON.parse(c.dataset.territoryPose||'{}'),spatial:JSON.parse(c.dataset.spatialInspection||'{}'),health:JSON.parse(c.dataset.commercialMapRenderHealth||'{}')})")
            health=report['views'][label]['health']
            if health.get('status')!='ready' or health.get('contextLosses') or health.get('lastErrorCode'):
                raise AssertionError(f'Render health at {label}: {health}')
        await event(page,{'keepRendering':False})
        for attempt in range(3):
            await canvas.evaluate("c=>delete c.dataset.territoryReport")
            await event(page,{**views()['access-oblique'],'measure':True})
            await page.wait_for_function("Boolean(document.querySelector('canvas')?.dataset.territoryReport)",timeout=60000)
            report['metrics'].append(await canvas.evaluate("c=>JSON.parse(c.dataset.territoryReport)"))
        await page.evaluate('window.__territorialStore.getState().setNightModeActive(true)')
        for label in ['test-drive-oblique','pecuaria-front']:
            await event(page,{**views()[label],'keepRendering':True})
            await page.wait_for_timeout(2000)
            await page.screenshot(path=str(out/f'{label}-night.png'))
        await page.evaluate('window.__territorialStore.getState().setNightModeActive(false)')
        await page.evaluate('window.__territorialStore.getState().setReducedGraphics(true)')
        await page.wait_for_timeout(1500)
        report['compatibilityNoticeCount']=await page.get_by_text('Perfil de compatibilidade ativo:',exact=False).count()
        if report['compatibilityNoticeCount']: raise AssertionError('Compatibility banner is visible')
        await event(page,{'keepRendering':False})
        report['overflow']=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
        if errors or report['overflow']: raise AssertionError('Page errors or overflow')
        report['status']='passed'
    except Exception as e:
        report.update(status='failed',error=str(e))
        report['canvas']=await page.locator('canvas').evaluate_all('(cs)=>cs.map(c=>({...c.dataset}))')
        await page.screenshot(path=str(out/'failure.png'))
        raise
    finally:
        (out/'runtime.json').write_text(json.dumps(report,indent=2))
        await context.close()

async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:4188');parser.add_argument('--output',default='territorial-validation/browser');parser.add_argument('--project',default='standard',choices=['standard','wide','mobile','all']);args=parser.parse_args()
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            for name,size in {'standard':{'width':1366,'height':900},'wide':{'width':1600,'height':1000},'mobile':{'width':390,'height':844}}.items():
                if args.project in [name,'all']: await run(browser,args.base,Path(args.output)/name,name,size)
        finally: await browser.close()
if __name__=='__main__': asyncio.run(main())
