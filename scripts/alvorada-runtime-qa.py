"""Real browser evidence, not a physical-device certification. Run against Vite.
Requires playwright==1.57.0 and its Chromium/WebKit distributions.
"""
import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(os.environ.get('ALVORADA_QA_OUT', 'runtime-audit/browser'))
BASE = os.environ.get('ALVORADA_QA_URL', 'http://127.0.0.1:4180')
SNAPSHOT = """() => ({ intro: {...document.querySelector('[data-testid="alvorada-intro"]')?.dataset}, canvas: {...document.querySelector('.alvorada-intro canvas')?.dataset}, telemetry: window.__alvoradaIntroTelemetry ?? null, rect: document.querySelector('.alvorada-intro')?.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth, canvases: document.querySelectorAll('canvas').length, ua: navigator.userAgent, sw: navigator.serviceWorker?.controller?.scriptURL ?? null })"""

async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        for engine in ['chromium', 'webkit']:
            browser = await getattr(p, engine).launch(headless=True, **({'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']} if engine == 'chromium' else {}))
            for mobile in [False, True]:
                for host in ['standalone', 'minimal', 'portal-card']:
                    for motion in ['no-preference', 'reduce']:
                        label = f'{engine}-{"mobile" if mobile else "desktop"}-{host}-{motion}'
                        context = await browser.new_context(viewport={'width': 390 if mobile else 1366, 'height': 844 if mobile else 800}, reduced_motion=motion, device_scale_factor=2 if mobile else 1)
                        page = await context.new_page()
                        errors, samples, seen = [], [], set()
                        page.on('pageerror', lambda e: errors.append(str(e)))
                        try:
                            await page.goto(f'{BASE}/scripts/alvorada-host-qa.html?host={host}&alvorada-debug=1', wait_until='domcontentloaded', timeout=60000)
                            start = time.monotonic()
                            while time.monotonic() - start < 42:
                                sample = await page.evaluate(SNAPSHOT)
                                samples.append(sample)
                                key = (sample['intro'].get('stage'), sample['canvas'].get('phase'))
                                if key not in seen:
                                    seen.add(key)
                                    await page.screenshot(path=str(OUT / f'{label}-{len(seen):02}.png'))
                                if len(samples) > 2 and not sample['intro'] and sample['telemetry']:
                                    break
                                await page.wait_for_timeout(200)
                        except Exception as e:
                            errors.append(str(e))
                        (OUT / f'{label}.json').write_text(json.dumps({'errors': errors, 'samples': samples}, indent=2))
                        print(label, 'errors=',len(errors), 'engines=', sorted({s['intro'].get('renderer','done') for s in samples}), flush=True)
                        await context.close()
            await browser.close()

asyncio.run(run())
