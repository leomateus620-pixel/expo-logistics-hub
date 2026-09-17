"""Real-map visual/performance evidence, with no backend writes.
Linux/software-GPU viewports do not certify physical mobile devices.
"""
import argparse
import asyncio
import json
import time
from pathlib import Path
from playwright.async_api import async_playwright

POSES = {
    'sector-top': {'target': [30, 0, -2.4], 'position': [29.99, 48, -2.4]},
    'roof-top': {'target': [39.5, 0, -2.4], 'position': [39.49, 24, -2.4]},
    'front': {'target': [40, 2.1, -3.2], 'position': [24, 5.3, -3.2]},
    'north-side': {'target': [39.5, 1.6, -2.4], 'position': [36, 8, -20]},
    'south-side': {'target': [39.5, 1.6, -2.4], 'position': [36, 8, 15]},
    'oblique': {'target': [37, 1.2, -2.4], 'position': [23, 19, 13]},
}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:4186')
    parser.add_argument('--output', default='arena-validation/browser')
    parser.add_argument('--phase', default='candidate')
    parser.add_argument('--mobile', action='store_true')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True,
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 390 if args.mobile else 1100,
            'height': 844 if args.mobile else 1450}, device_scale_factor=1,
            is_mobile=args.mobile, has_touch=args.mobile)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        report = {'phase': args.phase, 'browser': browser.version, 'softwareGPU': True,
            'mobileViewport': args.mobile, 'errors': errors, 'views': {}, 'performance': []}
        try:
            start = time.monotonic()
            await page.goto(args.base + '/__dev/commercial-map-rendering', wait_until='domcontentloaded', timeout=120000)
            # Hide only QA controls and pin the scene viewport; live counters
            # must not change its size or make locator.screenshot wait forever.
            await page.add_style_tag(content='''
              .commercial-map-rendering-diagnostics__toolbar,
              .commercial-map-rendering-diagnostics__stress,
              .commercial-map-rendering-diagnostics__metrics{display:none!important}
              .commercial-map-rendering-diagnostics__viewport{
                position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
              }
            ''')
            await page.wait_for_function("document.querySelector('canvas')?.dataset.territoryQa==='ready'", timeout=180000)
            await page.wait_for_function("JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth||'{}').status==='ready'", timeout=180000)
            report['readyMs'] = round((time.monotonic() - start) * 1000)
            await page.wait_for_function("document.querySelector('canvas')?.dataset.commercialMapHydration==='complete'", timeout=180000)
            report['hydratedMs'] = round((time.monotonic() - start) * 1000)
            await page.evaluate("async()=>{const {useCommercialMapStore:s}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');window.__arenaQaStore=s;s.getState().setLabelsVisible(false);}")
            await page.wait_for_timeout(2500)
            canvas = page.locator('.commercial-map-rendering-diagnostics__viewport canvas')
            for name, pose in POSES.items():
                await page.evaluate("pose=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:pose}))", pose)
                await page.wait_for_timeout(2000)
                await page.screenshot(path=str(output / f'{args.phase}-{name}.png'))
                report['views'][name] = await canvas.evaluate('(c)=>({...c.dataset})')
            for attempt in range(3):
                await page.evaluate("pose=>window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...pose,measure:true}}))", POSES['oblique'])
                await page.wait_for_timeout(8000)
                report['performance'].append(await canvas.evaluate("c=>JSON.parse(c.dataset.territoryReport||'{}')"))
            for reduced in [True, False, True, False]:
                await page.evaluate("v=>window.__arenaQaStore.getState().setReducedGraphics(v)", reduced)
                await page.wait_for_timeout(1500)
            await page.evaluate("window.__arenaQaStore.getState().setNightModeActive(true)")
            await page.wait_for_timeout(2000)
            await page.screenshot(path=str(output / f'{args.phase}-night.png'))
            await page.evaluate("window.__arenaQaStore.getState().setNightModeActive(false)")
            await page.wait_for_timeout(1500)
            report['finalHealth'] = await canvas.evaluate("c=>JSON.parse(c.dataset.commercialMapRenderHealth||'{}')")
            report['horizontalOverflow'] = await page.evaluate('document.documentElement.scrollWidth > innerWidth')
            if errors or report['finalHealth'].get('status') != 'ready':
                raise AssertionError('Runtime errors or unhealthy renderer; see report')
            report['status'] = 'passed'
        except Exception as error:
            report.update(status='failed', error=str(error))
            report['datasets'] = await page.locator('canvas').evaluate_all('(items)=>items.map(c=>({...c.dataset}))')
            await page.screenshot(path=str(output / f'{args.phase}-failure.png'))
            raise
        finally:
            (output / f'{args.phase}-runtime.json').write_text(json.dumps(report, indent=2))
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
