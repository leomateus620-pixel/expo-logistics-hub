/* Local visual evidence using existing DEV fixtures. Never writes production data. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'after';
const metricsOnly = process.argv[4] === 'metrics-only';
const origin = process.argv[3] || 'http://127.0.0.1:5191';
const output = path.resolve('docs/validation/commission-workspace', phase);
fs.mkdirSync(output, { recursive: true });
const report = { phase, origin, fixtureBoundary: 'Existing DEV fixtures only; no authenticated backend or production persistence', captures: [], checks: [], errors: [] };
const check = (name, passed, detail) => { report.checks.push({name,passed,detail}); console.log(JSON.stringify(report.checks.at(-1))); };

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  async function goto(params) {
    const sectionPaths = { overview: 'dashboard', agenda: 'agenda', documents: 'documentos', team: 'equipe', tasks: 'tarefas' };
    const url = `${origin}/__dev/comissao-agenda/${sectionPaths[params.tab] || 'agenda'}?${new URLSearchParams(params)}`;
    try { await page.goto(url, { waitUntil: 'commit', timeout: 30000 }); }
    catch (error) {
      if (!error.message.includes('ERR_ABORTED')) throw error;
      await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    }
    await page.locator('.unit-workspace').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(300);
  }
  async function capture(name, extra = {}) {
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const header = document.querySelector('.cw-header')?.getBoundingClientRect();
      const firstEvent = document.querySelector('.ua-event-card')?.getBoundingClientRect();
      const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
      return { viewport: { width: innerWidth, height: innerHeight }, bodyWidth: document.documentElement.scrollWidth,
        fontsStatus: document.fonts.status, loadedFontFamilies: [...new Set([...document.fonts].filter(font=>font.status==='loaded').map(font=>font.family))],
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        headerHeight: header?.height ?? null, firstEventTop: firstEvent?.top ?? null,
        dialog: dialog ? { width: dialog.width, height: dialog.height, x: dialog.x, y: dialog.y } : null,
        activeLinks: [...document.querySelectorAll('a[aria-current="page"]')].filter(a => a.getBoundingClientRect().width > 0).map(a => a.textContent.trim()),
      };
    });
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: false });
    report.captures.push({ file, ...metrics, ...extra });
    console.log(`capture ${phase}/${file} firstEventTop=${metrics.firstEventTop} overflow=${metrics.horizontalOverflow}`);
  }
  for (const [screen, size] of [['desktop',{width:1366,height:768}],['mobile',{width:390,height:844}]]) {
    await page.setViewportSize(size);
    for (const tab of metricsOnly ? ['agenda'] : ['overview','agenda','documents','team','tasks']) {
      await goto({tab, unit:'acolhimento-e-bem-comum'});
      await capture(`${screen}-${tab}`);
    }
    await goto({tab:'agenda', unit:'assessoria-de-relacoes-internacionais'});
    await capture(`${screen}-long-advisory`);
    if(metricsOnly) continue;
    await goto({tab:'agenda', open:'create', unit:'acolhimento-e-bem-comum'});
    await page.getByRole('dialog').waitFor();
    await capture(`${screen}-create`);
    const group = page.locator('.ua-form__section').filter({has: page.getByText(phase === 'before' ? 'Responsáveis' : 'Pessoas responsáveis', {exact:true})}).first();
    if (await group.count()) await group.scrollIntoViewIfNeeded();
    else await page.locator('.ua-form').evaluate(el => el.closest('.ua-sheet__body').scrollTop = 620);
    await capture(`${screen}-create-people`);
    await goto({tab:'agenda',open:'ev-06',unit:'acolhimento-e-bem-comum'});
    await page.getByRole('dialog').waitFor();
    await capture(`${screen}-many-responsibles-detail`);
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    await page.locator('.ua-form').waitFor();
    await capture(`${screen}-many-responsibles-edit`);
    await goto({tab:'documents',state:'empty',unit:'acolhimento-e-bem-comum'});
    await capture(`${screen}-documents-empty`);
  }
  if(metricsOnly) {
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:844});
      await goto({tab:'agenda',unit:'assessoria-de-relacoes-internacionais'});
      await capture(`${width}-long-advisory`);
    }
    await browser.close();
    return;
  }

  await page.setViewportSize({width:1366,height:768});
  await goto({tab:'agenda',unit:'acolhimento-e-bem-comum'});
  check('Timeline is initial Agenda view', await page.getByRole('button',{name:'Linha do tempo',exact:true}).getAttribute('aria-pressed') === 'true');
  const countBefore = await page.locator('.ua-event-card').count();
  await page.locator('.ua-search input').fill('Michelin');
  check('Search filters actual fixture events', await page.locator('.ua-event-card').count() === 2, {before:countBefore,after:await page.locator('.ua-event-card').count()});
  await page.getByRole('button',{name:'Limpar busca',exact:true}).click();
  await page.getByRole('button',{name:'Calendário',exact:true}).click();
  check('Calendar remains available', await page.getByRole('button',{name:'Calendário',exact:true}).getAttribute('aria-pressed') === 'true');
  await capture('desktop-calendar');
  await page.getByRole('button',{name:'Linha do tempo',exact:true}).click();
  const filterTrigger = page.getByRole('button',{name:'Filtros',exact:true});
  await filterTrigger.click();
  await page.getByRole('dialog').waitFor();
  await capture('desktop-filters');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check('Filters close with Escape', await page.getByRole('dialog').count() === 0);
  if (phase === 'after') {
    const status = page.locator('.ua-toolbar__status select');
    await status.selectOption('upcoming');
    check('Native status selector preserves upcoming filter',await page.locator('.ua-event-card').count()===10);
    await status.selectOption('all');
    const year = page.locator('.ua-toolbar__period select').first();
    const month = page.locator('.ua-toolbar__period select').nth(1);
    await year.selectOption('2027');
    check('Year selector preserves2027 event filtering',await page.locator('.ua-event-card').count()===2);
    await month.selectOption('2');
    check('Month selector preserves February event filtering',await page.locator('.ua-event-card').count()===1);
    await year.selectOption('2026');
    check('Changing year resets period as before',await month.inputValue()==='all'&&await page.locator('.ua-event-card').count()===17);
    const summary = page.locator('.ua-agenda-summary');
    check('Agenda metrics start collapsed',await summary.getAttribute('open')===null);
    await summary.locator('summary').click();
    await capture('desktop-agenda-summary');
    check('Agenda metrics remain accessible on demand',await summary.getAttribute('open')!==null&&await summary.locator('.ua-kpis').isVisible());
  }

  await page.setViewportSize({width:390,height:844});
  await goto({tab:'agenda',unit:'assessoria-de-relacoes-internacionais'});
  const navTrigger = page.getByRole('button',{name:'Abrir menu',exact:true,includeHidden:true});
  await navTrigger.click();
  await page.getByRole('dialog').waitFor();
  await capture('mobile-navigation');
  check('Mobile navigation is expanded', await navTrigger.getAttribute('aria-expanded') === 'true');
  const drawerControls = [];
  for(const element of await page.getByRole('dialog').locator('a[href], button:not([disabled])').all()) if(await element.isVisible()) drawerControls.push(element);
  await drawerControls.at(-1).focus();
  await page.keyboard.press('Tab');
  const wrapsForward = await drawerControls[0].evaluate(el=>el===document.activeElement);
  await page.keyboard.press('Shift+Tab');
  const wrapsBack = await drawerControls.at(-1).evaluate(el=>el===document.activeElement);
  check('Mobile navigation traps keyboard focus both ways',wrapsForward&&wrapsBack);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check('Mobile navigation closes and restores focus', await page.getByRole('dialog').count() === 0 && await navTrigger.evaluate(el=>el===document.activeElement));
  await navTrigger.click();
  await page.getByRole('dialog').getByRole('link',{name:'Documentos',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  check('Mobile navigation preserves destination and closes', page.url().includes('tab=documents') && await page.getByRole('dialog').count() === 0);
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    await goto({tab:'agenda',unit:'assessoria-de-relacoes-internacionais'});
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
    check(`No page horizontal overflow at ${width}px`,!overflow);
    await capture(`${width}-long-advisory`);
  }
  await context.close();
  await browser.close();
}

main().catch(error => { report.errors.push(error.stack); console.error(error); process.exitCode=1; }).finally(()=>{
  const previousFile = path.join(output,'results.json');
  if(metricsOnly && fs.existsSync(previousFile)) {
    const previous = JSON.parse(fs.readFileSync(previousFile,'utf8'));
    const byFile = new Map(previous.captures.map(item=>[item.file,item]));
    for(const item of report.captures) byFile.set(item.file,item);
    report.captures = [...byFile.values()];
    report.checks = previous.checks;
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
  process.exit(process.exitCode || 0);
});
