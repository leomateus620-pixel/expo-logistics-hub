"""Executable motion-policy regression gate, not just screenshot collection.

Production-built real PortalHero/Canvas. Cold real-time lifecycle + warm matched
frames with Playwright's clock. Browser contexts emulate media/viewport, NOT
physical iPhones, Windows drivers or the authenticated Portal workload.
"""
import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright

EXPECTED = ['preparing', 'globe', 'approach', 'alvorada', 'finished']
PREFS = ['no-preference', 'reduce']
SAMPLES = [('T0-globe', .32), ('T1-approach', 2.4), ('T2-santa-rosa', 4.208),
           ('T3-atmosphere', 4.8), ('T4-dawn', 5.6), ('T5-brand', 6.8)]
INIT = """(() => {
  let seed = 147148149;
  Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  window.__motionHistory = [];
  const record = () => {
    const intro = document.querySelector('[data-testid="alvorada-intro"]');
    if (!intro) return;
    const value = {stage:intro.dataset.stage, engine:intro.dataset.visualEngine,
      motion:intro.dataset.motionMode, reason:intro.dataset.staticReason ?? null};
    if (JSON.stringify(value) !== JSON.stringify(window.__motionHistory.at(-1))) window.__motionHistory.push(value);
  };
  new MutationObserver(record).observe(document, {subtree:true,childList:true,attributes:true,
    attributeFilter:['data-stage','data-visual-engine','data-motion-mode','data-static-reason']});
})();"""
STYLE_SAMPLE = """() => Object.fromEntries([
 '.fenasoja-portal__hero','.fenasoja-portal__intro','.alvorada-intro__canvas',
 '.alvorada-preparing','.alvorada-preparing__orbit','.alvorada-harvest',
 '.alvorada-harvest img','.alvorada-brand-hero','.alvorada-brand-hero__brand',
 '.alvorada-brand-hero__statement'
].map(selector=>{const el=document.querySelector(selector);if(!el)return [selector,null];
 const s=getComputedStyle(el);return [selector,{animationDuration:s.animationDuration,
 animationDelay:s.animationDelay,animationIterationCount:s.animationIterationCount,
 transitionDuration:s.transitionDuration,transitionDelay:s.transitionDelay,
 transitionTimingFunction:s.transitionTimingFunction}];}))"""
# A CSS clock for matched stills only. CSS/WAAPI does not follow the mocked JS
# clock automatically. Register transitions on first observation, then advance
# their real effects at the same virtual rate, without editing styles/keyframes.
SYNC_CSS = """() => {
 window.__cssClock ??= new Map();
 const now=performance.now();
 for(const animation of document.getAnimations()) {
   if(!window.__cssClock.has(animation)) {
     window.__cssClock.set(animation,now);
     animation.pause();
   }
   animation.currentTime=now-window.__cssClock.get(animation);
 }
}"""


def check(value, message):
    if not value:
        raise AssertionError(message)


def sequence(history):
    result = []
    for item in history:
        if not result or result[-1] != item['stage']:
            result.append(item['stage'])
    return result


async def options(browser, mobile, preference):
    return await browser.new_context(
        viewport={'width': 390 if mobile else 1366, 'height': 844 if mobile else 900},
        device_scale_factor=2 if mobile else 1,
        is_mobile=mobile, has_touch=mobile, reduced_motion=preference,
        service_workers='block', locale='pt-BR', timezone_id='America/Sao_Paulo')


async def lifecycle(browser, mobile, preference, base, output, name, toggle=False, technical=False, skip=False):
    context = await options(browser, mobile, preference)
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    await page.add_init_script(INIT)
    if technical:
        await page.add_init_script("""const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(api,...args){
          return /^webgl|experimental-webgl/.test(api) ? null : original.call(this,api,...args);};""")
    try:
        await page.goto(base + '?cold=1', wait_until='load')
        await page.wait_for_function("document.querySelector('[data-testid=alvorada-intro]')?.dataset.stage==='globe'", timeout=45000)
        initial = await page.evaluate('window.__alvoradaMotionQA.sample()')
        styles = await page.evaluate(STYLE_SAMPLE)
        other = await page.locator('[data-testid=outside-motion]').evaluate('(el)=>getComputedStyle(el).transitionDuration')
        check(other == ('1e-05s' if preference == 'reduce' else '2s') or
              (preference == 'reduce' and float(other.rstrip('s')) < .001), f'Global preference was altered: {other}')
        final_pref = preference
        if toggle:
            final_pref = 'reduce' if preference == 'no-preference' else 'no-preference'
            await page.emulate_media(reduced_motion=final_pref)
            check(await page.evaluate(STYLE_SAMPLE) == styles, 'Changing OS preference changed Alvorada CSS')
        samples = []
        if skip:
            await page.get_by_role('button', name='Pular animação e mostrar a contagem oficial').click()
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if await page.locator('.fenasoja-portal__hero').get_attribute('data-intro') == 'done':
                break
            sample = await page.evaluate('window.__alvoradaMotionQA.sample()')
            if sample['canvas'] and 'elapsed' in sample['canvas']:
                check(sample['canvas']['elapsed'] == sample['canvas']['visualElapsed'], 'Static/reduced sampled timeline detected')
                samples.append(sample)
            await page.wait_for_timeout(50)
        check(await page.locator('.fenasoja-portal__hero').get_attribute('data-intro') == 'done', 'No countdown handoff')
        check(await page.locator('canvas').count() == 0, 'Canvas not released')
        check(await page.locator('.portal-official-countdown').get_attribute('data-concealed') is None, 'Countdown still concealed')
        check(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow')
        history = await page.evaluate('window.__motionHistory')
        diagnostic = await page.evaluate('window.__alvoradaMotionQA.diagnostic()')
        check(diagnostic['prefersReducedMotion'] == (final_pref == 'reduce'), 'Debug preference incorrect')
        check(diagnostic['motionMode'] == 'canonical', 'Debug motion not canonical')
        if not skip:
            check(sequence(history) == EXPECTED, f'Unexpected stages {sequence(history)}')
        check(all(x['motion'] == 'canonical' for x in history), 'Second motion policy detected')
        check(not errors, f'Page errors: {errors}')
        if technical:
            check(diagnostic['visualEngine'] == 'emergency-fallback', 'Real WebGL failure unprotected')
            check(diagnostic['fallbackReason'] in ['render-error', 'unsupported-webgl'], 'Wrong technical reason')
        else:
            check(all(x['engine'] == 'webgl-canonical' for x in history), f'Wrong engines: {history}')
            check(diagnostic['fallbackReason'] is None, f'Unexpected fallback: {diagnostic["fallbackReason"]}')
            check(all(e['name'] != 'stage-invariant-violation' for e in diagnostic['events']), 'Stage invariant violation')
            if not skip:
                positions = {tuple(x['camera']['position']) for x in samples if x['camera']}
                check(len(positions) > 15, 'Camera did not travel continuously')
        check(all(x['reason'] != 'reduced-motion' for x in history), 'Preference used as technical reason')
        result = {'history': history, 'diagnostic': diagnostic, 'samples': samples, 'initial': initial, 'styles': styles, 'outsideTransition': other}
        (output / f'{name}.json').write_text(json.dumps(result, indent=2))
        await page.screenshot(path=str(output / f'{name}-countdown.png'))
        return result
    except Exception:
        await page.screenshot(path=str(output / f'{name}-failure.png'))
        (output / f'{name}-failure.json').write_text(json.dumps(await page.evaluate('({history:window.__motionHistory,telemetry:window.__alvoradaIntroTelemetry})'), indent=2))
        raise
    finally:
        await context.close()


async def matched_frames(browser, mobile, preference, base, output, name):
    context = await options(browser, mobile, preference)
    page = await context.new_page()
    await page.add_init_script(INIT)
    origin = datetime(2026, 9, 14, 9, tzinfo=timezone.utc)
    try:
        await page.clock.install(time=origin)
        await page.clock.pause_at(origin + timedelta(seconds=1))
        await page.goto(base, wait_until='load')
        await page.evaluate('window.__alvoradaMotionQA.warm()')
        await page.evaluate('window.__alvoradaMotionQA.start()')
        ready = False
        for _ in range(700):
            await page.clock.run_for(16)
            await page.evaluate(SYNC_CSS)
            state = await page.evaluate('window.__alvoradaMotionQA.sample()')
            if state['canvas'] and 'elapsed' in state['canvas']:
                ready = True
                break
            await asyncio.sleep(.005)  # real asynchronous shader compilation
        check(ready, 'Canonical first frame never presented')
        # Finish only the surrounding host reveal, outside the authored scene,
        # to isolate the pixel comparison from variable shader-compile latency.
        await page.evaluate("document.querySelector('.fenasoja-portal__hero').getAnimations().forEach(a=>{a.currentTime=10000})")
        frames = []
        for label, target in SAMPLES:
            for _ in range(500):
                state = await page.evaluate('window.__alvoradaMotionQA.sample()')
                elapsed = float(state['canvas'].get('elapsed', 0)) if state['canvas'] else target
                if elapsed >= target - .001:
                    break
                await page.clock.run_for(16)
                await page.evaluate(SYNC_CSS)
            dataset = await page.locator('[data-testid=alvorada-intro]').evaluate('(el)=>({...el.dataset})')
            check(dataset['visualEngine'] == 'webgl-canonical', 'Wrong visual engine at capture')
            check(dataset['motionMode'] == 'canonical', 'Wrong motion mode at capture')
            if state['canvas']:
                check(abs(float(state['canvas']['elapsed']) - float(state['canvas']['visualElapsed'])) < .001, 'Static sampler used')
            # JS clock is paused; screenshot does not fast-forward animations.
            clip = await page.locator('.fenasoja-portal__intro').bounding_box()
            filename = f'{name}-{label}.png'
            await page.screenshot(path=str(output / filename), clip=clip, animations='allow')
            frames.append({'label': label, 'target': target, 'state': state, 'dataset': dataset,
                           'styles': await page.evaluate(STYLE_SAMPLE), 'image': filename})
        (output / f'{name}-frames.json').write_text(json.dumps(frames, indent=2))
        return frames
    finally:
        await context.close()


def compare_frames(left, right, output):
    results = []
    for a, b in zip(left, right):
        check(a['styles'] == b['styles'], f'CSS duration/delay differs at {a["label"]}')
        check(a['dataset']['stage'] == b['dataset']['stage'], 'Visual stages differ')
        if a['state']['camera'] and b['state']['camera']:
            for key in ['position', 'quaternion']:
                error = max(abs(x-y) for x,y in zip(a['state']['camera'][key], b['state']['camera'][key]))
                check(error < 1e-5, f'Camera differs at {a["label"]}: {error}')
        im1 = Image.open(output / a['image']).convert('RGB')
        im2 = Image.open(output / b['image']).convert('RGB')
        check(im1.size == im2.size, 'Card size changed with preference')
        check(max(ImageStat.Stat(im1).stddev) > 5, 'Empty image passed visual gate')
        diff = ImageChops.difference(im1, im2)
        mae = sum(ImageStat.Stat(diff).mean)/3
        diff.save(output / f'diff-{a["image"]}')
        results.append({'frame': a['label'], 'meanAbsoluteChannelDifference': mae, 'limit': 2.0})
        # Small raster/compositor noise is permitted, not a different planet.
        check(mae <= 2.0, f'Visual mismatch at {a["label"]}: MAE {mae:.3f}/255')
    return results


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:4181/scripts/alvorada-motion-qa.html')
    parser.add_argument('--output', default='runtime-motion')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    results = []
    async def run(name, callback):
        try:
            value = await callback()
            results.append({'case': name, 'status': 'passed'})
            print('PASS', name, flush=True)
            return value
        except Exception as error:
            results.append({'case': name, 'status': 'failed', 'error': str(error)})
            print('FAIL', name, str(error), flush=True)
    async with async_playwright() as pw:
        for browser_name in ['chromium', 'webkit']:
            browser = await getattr(pw, browser_name).launch(headless=True,
                args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if browser_name == 'chromium' else [])
            results.append({'browser': browser_name, 'version': browser.version})
            for mobile in [False, True]:
                device = f'{browser_name}-{"mobile" if mobile else "desktop"}'
                cold = []; pairs = []
                for pref in PREFS:
                    name = f'{device}-{pref}'
                    cold.append(await run(name+'-cold', lambda: lifecycle(browser,mobile,pref,args.base_url,output,name+'-cold')))
                    pairs.append(await run(name+'-frames', lambda: matched_frames(browser,mobile,pref,args.base_url,output,name)))
                if all(pairs):
                    async def compare():
                        comparison = compare_frames(*pairs, output)
                        (output / f'{device}-comparison.json').write_text(json.dumps(comparison,indent=2))
                        check(sequence(cold[0]['history']) == sequence(cold[1]['history']), 'Stage sequences differ')
                    await run(device+'-ON-OFF-equality', compare)
                await run(device+'-toggle-live', lambda: lifecycle(browser,mobile,'no-preference',args.base_url,output,device+'-toggle-live',toggle=True))
                await run(device+'-skip-reduce', lambda: lifecycle(browser,mobile,'reduce',args.base_url,output,device+'-skip-reduce',skip=True))
            for pref in PREFS:
                await run(browser_name+'-technical-'+pref, lambda: lifecycle(browser,False,pref,args.base_url,output,browser_name+'-technical-'+pref,technical=True))
            await browser.close()
    (output / 'summary.json').write_text(json.dumps(results, indent=2))
    if any(x.get('status') == 'failed' for x in results):
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
