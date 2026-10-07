/* Local presentation QA. Synthetic data only; external financial access is blocked. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'after';
const origin = process.argv[3] || 'http://127.0.0.1:5195';
const output = process.env.QA_OUTPUT ? path.resolve(process.env.QA_OUTPUT) : path.resolve('docs/validation/financial-2028', phase);
fs.mkdirSync(output, { recursive: true });
const views = ['dashboard','receitas-projetadas','receitas-confirmadas','despesas-previstas','despesas-realizadas','orcamento-comissoes','patrocinios','simulacoes','relatorios'];
const report = { phase, fixtureBoundary: 'Synthetic QA API + real page/layout/dialogs; no backend access or financial writes', captures: [], checks: [], errors: [], blockedRequests: [] };
let activeBrowser;
const check = (name, passed, detail) => { report.checks.push({ name, passed, detail }); console.log(JSON.stringify(report.checks.at(-1))); };
async function main() {
  const browser = activeBrowser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['127.0.0.1','localhost','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) || !url.protocol.startsWith('http')) return route.continue();
    report.blockedRequests.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  async function goto(view, edition = '2028', state = 'rich') {
    await page.goto(`${origin}/comissoes/financeiro-gerencial/${view}?edicao=${edition}&state=${state}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.locator(edition === '2028' ? '.financial-operational-2028' : '.financial-management-page').waitFor({timeout:60000});
    if (state !== 'loading') await page.getByText(/Abrindo Fenasoja|Carregando receitas|Carregando orçamentos|Carregando patrocínios|Consolidando a edição/).waitFor({state:'hidden',timeout:10000}).catch(()=>{});
    await page.evaluate(() => document.fonts.ready);
    // The historical module retains its original count-up animations, including
    // reduced-motion exceptions. Wait for them to finish for comparable pixels.
    await page.waitForTimeout(edition === '2026' ? 1600 : 500);
  }
  async function capture(name) {
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][data-state="open"]');
      const rect = dialog?.getBoundingClientRect();
      const input = dialog?.querySelector('input');
      const label = dialog?.querySelector('label');
      const style = el => el ? { background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, border: getComputedStyle(el).borderColor, opacity: getComputedStyle(el).opacity, zIndex: getComputedStyle(el).zIndex } : null;
      return { viewport: { width: innerWidth, height: innerHeight }, bodyWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        dialog: rect ? { x:rect.x,y:rect.y,width:rect.width,height:rect.height, styles:style(dialog), input:style(input), label:style(label) } : null,
        heading: document.querySelector('main h1')?.textContent ?? document.querySelector('main h2')?.textContent,
        activeMenu: [...document.querySelectorAll('nav a[aria-current="page"]')].map(a=>a.textContent.trim()),
      };
    });
    const file = `${name}.png`;
    await page.screenshot({path:path.join(output,file),fullPage:false});
    report.captures.push({file,...metrics});
    console.log(`capture ${file} overflow=${metrics.horizontalOverflow}`);
  }
  for (const [screen,size] of [['desktop',{width:1366,height:768}],['notebook',{width:1024,height:768}],['mobile',{width:390,height:844}]]) {
    if (process.env.QA_SCREENS && !process.env.QA_SCREENS.split(',').includes(screen)) continue;
    await page.setViewportSize(size);
    for (const edition of ['2028','2026']) {
      if (process.env.QA_EDITIONS && !process.env.QA_EDITIONS.split(',').includes(edition)) continue;
      for (const view of views) {
        if (process.env.QA_VIEWS && !process.env.QA_VIEWS.split(',').includes(view)) continue;
        await goto(view,edition); await capture(`${screen}-${edition}-${view}`);
      }
    }
    if (process.env.QA_VIEWS_ONLY) continue;
    for (const [view,button,name] of [['receitas-projetadas','Nova receita','revenue'],['orcamento-comissoes','Novo orçamento','budget'],['patrocinios','Novo patrocínio','sponsorship']]) {
      await goto(view); await page.getByRole('button',{name:button,exact:true}).click();
      await page.getByRole('dialog').waitFor(); await capture(`${screen}-create-${name}`);
      if (name !== 'sponsorship') { await page.getByRole('combobox').first().click(); await page.getByRole('listbox').waitFor(); await capture(`${screen}-${name}-select`); await page.keyboard.press('Escape'); }
      await page.keyboard.press('Escape');
    }
    await goto('receitas-projetadas');
    const revenueEdit = page.getByRole('button',{name:/Editar Receita sintética Beta/});
    if (await revenueEdit.count()) await revenueEdit.click();
    else await page.locator('.f28-ledger-mobile-record').filter({has:page.getByRole('heading',{name:/Receita sintética Beta/})}).getByRole('button',{name:'Editar',exact:true}).click();
    await page.getByRole('dialog').waitFor(); await capture(`${screen}-edit-revenue`); await page.keyboard.press('Escape');
    await goto('orcamento-comissoes');
    await page.getByRole('button',{name: /^Editar(?: orçamento.*)?$/}).first().click(); await page.getByRole('dialog').waitFor(); await capture(`${screen}-edit-budget`); await page.keyboard.press('Escape');
    await page.getByRole('button',{name:/^(Linha|Adicionar linha)(?:.*)?$/}).first().click(); await page.getByRole('dialog').waitFor(); await capture(`${screen}-create-budget-line`); await page.keyboard.press('Escape');
    await goto('patrocinios');
    const sponsorEdit = page.getByRole('button',{name:/Editar Patrocinador sintético Alpha/});
    if (await sponsorEdit.count()) await sponsorEdit.click();
    else await page.locator('.f28-ledger-mobile-record').filter({has:page.getByRole('heading',{name:/Patrocinador sintético Alpha/})}).getByRole('button',{name:'Editar',exact:true}).click();
    await page.getByRole('dialog').waitFor(); await capture(`${screen}-edit-sponsorship`); await page.keyboard.press('Escape');
  }
  if (!process.env.QA_VIEWS_ONLY) {
    await page.setViewportSize({width:390,height:844});
    for (const [view,state] of [['dashboard','empty'],['receitas-projetadas','empty'],['orcamento-comissoes','empty'],['patrocinios','empty'],['dashboard','denied'],['dashboard','inactive'],['dashboard','error'],['dashboard','negative'],['dashboard','unavailable']]) {
      await goto(view,'2028',state); await capture(`mobile-state-${state}-${view}`);
    }
  }
  check('No external financial requests',!report.blockedRequests.some(url=>/supabase|financial_|\/rpc\//i.test(url)), [...new Set(report.blockedRequests)]);
  check('No JavaScript errors',report.errors.length === 0,report.errors);
  check('No 2028 page horizontal overflow',!report.captures.some(c=>c.file.includes('2028')&&c.horizontalOverflow));
  check('No forms horizontal overflow',!report.captures.some(c=>c.dialog&&c.horizontalOverflow));
  if (report.checks.some(item => !item.passed)) process.exitCode = 1;
  await browser.close();
}
main().catch(error=>{report.errors.push(error.stack);console.error(error);process.exitCode=1;}).finally(async()=>{
  await activeBrowser?.close();
  report.blockedRequests = [...new Set(report.blockedRequests.map(url=>new URL(url).origin))];
  for(const item of report.checks) if(item.name==='No external financial requests') item.detail=report.blockedRequests;
  const priorFile=path.join(output,'results.json');
  if ((process.env.QA_SCREENS || process.env.QA_VIEWS_ONLY || process.env.QA_EDITIONS) && fs.existsSync(priorFile)) {
    const prior=JSON.parse(fs.readFileSync(priorFile,'utf8'));
    const captures=new Map(prior.captures.map(c=>[c.file,c])); for(const capture of report.captures)captures.set(capture.file,capture);report.captures=[...captures.values()];
  }
  for (const item of report.checks) {
    if (item.name==='No 2028 page horizontal overflow') item.passed=!report.captures.some(c=>c.file.includes('2028')&&c.horizontalOverflow);
    if (item.name==='No forms horizontal overflow') item.passed=!report.captures.some(c=>c.dialog&&c.horizontalOverflow);
  }
  if (report.checks.some(item=>!item.passed)) process.exitCode=1;
  fs.writeFileSync(priorFile,JSON.stringify(report,null,2));
});
