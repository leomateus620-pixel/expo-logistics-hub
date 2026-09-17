"""Read-only real-map evidence using identical before/after cameras.

The software-GPU runner may need minutes to compile and reveal ALL deferred
layers. Wait for recorded progress, not a guessed 90-frame deadline. This is a
QA budget only; production hydration, effects, quality and timings are unchanged.
"""
import argparse
import asyncio
import json
import time
from pathlib import Path

from PIL import Image, ImageStat
from playwright.async_api import async_playwright

POSES = {
    'sector-top': {'target': [29, 0, -3.58], 'position': [28.99, 48, -3.58]},
    'roof-top': {'target': [38.12, 0, -3.58], 'position': [38.11, 24, -3.58]},
    'front': {'target': [38.12, 1.1, -3.58], 'position': [21, 4.4, -3.58]},
    'rear': {'target': [38.12, 1.1, -3.58], 'position': [55, 4.4, -3.58]},
    'left': {'target': [38.12, 1.1, -3.58], 'position': [37, 7, -21]},
    'right': {'target': [38.12, 1.1, -3.58], 'position': [37, 7, 14]},
    'oblique-1': {'target': [36, 1, -3.58], 'position': [21, 15, 11]},
    'oblique-2': {'target': [37, 1, -3.58], 'position': [25, 17, -18]},
}
REQUIRED_LAYERS = ['arena-context', 'vegetation', 'site-context']


async def inspect(page):
    await page.evaluate("window.dispatchEvent(new CustomEvent('territory-qa', {detail: {inspectArena: true}}))")
    return await page.locator('canvas').evaluate("c => JSON.parse(c.dataset.arenaInspection || '{}')")


async def pose(page, value):
    await page.evaluate("pose => window.dispatchEvent(new CustomEvent('territory-qa', {detail: pose}))", value)


async def screenshot(page, path):
    await page.screenshot(path=str(path))
    image = Image.open(path).convert('RGB')
    if max(ImageStat.Stat(image).stddev) < 8:
        raise AssertionError(f'Blank/flat capture: {path.name}')


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:4186')
    parser.add_argument('--output', default='arena-validation/browser')
    parser.add_argument('--phase', default='candidate')
    parser.add_argument('--viewport', choices=['wide', 'desktop', 'mobile'], default='desktop')
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    width, height = {'wide': (1920, 1080), 'desktop': (1366, 900), 'mobile': (390, 844)}[args.viewport]
    stem = f'{args.phase}-{args.viewport}'
    report = {'phase': args.phase, 'viewport': [width, height], 'softwareGPU': True,
              'views': {}, 'performance': [], 'errors': [], 'hydrationProgress': []}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        report['browser'] = browser.version
        page = await browser.new_page(viewport={'width': width, 'height': height},
                                      device_scale_factor=1, is_mobile=args.viewport == 'mobile',
                                      has_touch=args.viewport == 'mobile')
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        try:
            start = time.monotonic()
            await page.goto(args.base + '/__dev/commercial-map-rendering', wait_until='domcontentloaded', timeout=120000)
            # Hide only diagnostic controls. No production object or effect is hidden.
            await page.add_style_tag(content='''
                .commercial-map-rendering-diagnostics__toolbar,
                .commercial-map-rendering-diagnostics__stress,
                .commercial-map-rendering-diagnostics__metrics { display:none!important }
                .commercial-map-rendering-diagnostics__viewport {
                    position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
                }
            ''')
            await page.wait_for_function("document.querySelector('canvas')?.dataset.territoryQa === 'ready'", timeout=120000)
            await page.evaluate("""async () => {
                const { useCommercialMapStore: store } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
                window.__arenaStore = store;
                store.getState().setLabelsVisible(false);
            }""")
            await pose(page, {**POSES['sector-top'], 'keepRendering': True})
            deadline = time.monotonic() + 360
            last_progress = time.monotonic()
            previous_marks = None
            ready = False
            while time.monotonic() < deadline:
                state = await inspect(page)
                report['hydration'] = state
                marks = state.get('boot', {}).get('marks', {})
                signature = sorted(marks.items())
                if signature != previous_marks:
                    last_progress = time.monotonic()
                    previous_marks = signature
                    report['hydrationProgress'].append({'elapsedMs': round((last_progress-start)*1000), 'marks': marks})
                (output / f'{stem}-progress.json').write_text(json.dumps(report, indent=2))
                if report['errors'] or state.get('boot', {}).get('failed'):
                    raise AssertionError('Runtime failed while hydrating; see progress report')
                if all(f'hydrate:{layer}:end' in marks for layer in REQUIRED_LAYERS):
                    ready = True
                    break
                if time.monotonic() - last_progress > 90:
                    raise AssertionError('Hydration made no recorded progress for 90 seconds')
                await page.wait_for_timeout(1000)
            if not ready:
                raise AssertionError('Required Arena/environment layers not hydrated within the QA budget')
            report['hydratedMs'] = round((time.monotonic()-start)*1000)
            required_names = {f'progressive-{layer}' for layer in REQUIRED_LAYERS}
            visible = {layer['name'] for layer in state['layers'] if layer['visible'] and layer['ancestorsVisible']}
            if not required_names <= visible:
                raise AssertionError('A required layer is still hidden')
            if args.phase == 'after':
                roots = [layer for layer in state['layers'] if layer['name'] == 'arena-sicredi-icatu-canonical']
                if len(roots) != 1:
                    raise AssertionError(f'Expected one canonical Arena, got {len(roots)}')
            if args.probe:
                await screenshot(page, output / f'{stem}-probe.png')
                return
            for name, value in POSES.items():
                await pose(page, value)
                await page.wait_for_timeout(1800)
                await screenshot(page, output / f'{stem}-{name}.png')
                report['views'][name] = await inspect(page)
            # Navigation is measured unchanged, three independent windows.
            for attempt in range(3):
                await page.locator('canvas').evaluate('canvas => delete canvas.dataset.territoryReport')
                await pose(page, {**POSES['oblique-1'], 'measure': True})
                await page.wait_for_function("Boolean(document.querySelector('canvas')?.dataset.territoryReport)", timeout=45000)
                sample = await page.locator('canvas').evaluate('canvas => JSON.parse(canvas.dataset.territoryReport)')
                if not sample.get('frames') or sample.get('health', {}).get('status') != 'ready':
                    raise AssertionError('Invalid/unhealthy performance sample')
                report['performance'].append(sample)
            for reduced in [True, False, True, False]:
                await page.evaluate('value => window.__arenaStore.getState().setReducedGraphics(value)', reduced)
                await page.wait_for_timeout(1200)
            await page.evaluate('window.__arenaStore.getState().setNightModeActive(true)')
            await page.wait_for_timeout(2200)
            await screenshot(page, output / f'{stem}-night.png')
            report['finalInspection'] = await inspect(page)
            report['finalHealth'] = await page.locator('canvas').evaluate("c => JSON.parse(c.dataset.commercialMapRenderHealth || '{}')")
            report['horizontalOverflow'] = await page.evaluate('document.documentElement.scrollWidth > innerWidth')
            if report['errors'] or report['finalHealth'].get('status') != 'ready' or report['horizontalOverflow']:
                raise AssertionError('Errors, overflow or unhealthy renderer')
            report['status'] = 'passed'
        except Exception as error:
            report.update(status='failed', error=str(error))
            report['datasets'] = await page.locator('canvas').evaluate_all('(items) => items.map(c => ({...c.dataset}))')
            await page.screenshot(path=str(output / f'{stem}-failure.png'))
            raise
        finally:
            (output / f'{stem}-runtime.json').write_text(json.dumps(report, indent=2))
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
