/* Exercices real local dialogs against the synthetic harness only. */
const fs=require('node:fs'); const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.argv[2] || 'http://127.0.0.1:5195';
const output=path.resolve('docs/validation/financial-2028/after');
const report={fixtureBoundary:'Local synthetic API only; no backend writes',checks:[],errors:[],captures:[]};
let activeBrowser;
const check=(name,passed,detail)=>{report.checks.push({name,passed,detail});console.log(JSON.stringify(report.checks.at(-1)));};
async function main(){
  const browser=activeBrowser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL || 'chrome'});
  const context=await browser.newContext({viewport:{width:1366,height:768},locale:'pt-BR',reducedMotion:'reduce'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  const go=async(view,state='rich',edition='2028')=>{await page.goto(`${origin}/comissoes/financeiro-gerencial/${view}?edicao=${edition}&state=${state}`,{waitUntil:'networkidle'});await page.locator(edition==='2028'?'.financial-operational-2028':'.financial-management-page').waitFor();await page.waitForTimeout(100);};
  const shot=async(name)=>{await page.screenshot({path:path.join(output,`${name}.png`)});report.captures.push(`${name}.png`);};
  await go('receitas-projetadas');
  check('Explicit deep link persists edition',await page.evaluate(()=>sessionStorage.getItem('financial-active-edition'))==='2028');
  await page.getByRole('link',{name:'Orçamento por Comissão',exact:true}).click();await page.waitForURL(/orcamento-comissoes\?.*edicao=2028/);
  check('Sidebar navigation retains edition2028',await page.locator('.financial-operational-2028').count()===1);
  await page.reload({waitUntil:'networkidle'});check('Refresh retains edition2028',await page.getByRole('radio',{name:/Fenasoja 2028/}).getAttribute('aria-checked')==='true');
  await page.goBack({waitUntil:'networkidle'});check('Browser back retains source menu and edition',page.url().includes('receitas-projetadas')&&page.url().includes('edicao=2028'));
  await page.goForward({waitUntil:'networkidle'});check('Browser forward retains destination and edition',page.url().includes('orcamento-comissoes')&&page.url().includes('edicao=2028'));
  const historic=page.getByRole('radio',{name:/Fenasoja 2026/});await historic.click();check('Edition switch opens actual historical page',await page.locator('.financial-management-page').count()===1&&await page.locator('.financial-operational-2028').count()===0&&page.url().includes('edicao=2026'));
  await historic.focus();await page.keyboard.press('ArrowRight');await page.waitForURL(/edicao=2028/);check('Edition radio keyboard selects and focuses2028',await page.getByRole('radio',{name:/Fenasoja 2028/}).evaluate(e=>document.activeElement===e));
  await page.goto(`${origin}/comissoes/financeiro-gerencial/receitas-projetadas?state=rich`,{waitUntil:'networkidle'});await page.waitForURL(/edicao=2028/);check('Missing edition parameter uses remembered edition and canonicalizes URL',page.url().includes('state=rich')&&page.url().includes('edicao=2028'));
  await page.getByRole('searchbox',{name:'Pesquisar',exact:true}).fill('Beta');
  const edit=page.getByRole('button',{name:/Editar Receita sintética Beta/});await edit.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);
  await edit.click();let dialog=page.getByRole('dialog');await dialog.waitFor();
  check('Dialog has opaque light surface',await dialog.evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'));
  check('Dialog autofocus enters first permanent-label field',await dialog.getByLabel(/^Descrição/).evaluate(e=>document.activeElement===e));
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  check('Escape restores exact opener focus and filter',await edit.evaluate(e=>document.activeElement===e)&&await page.getByRole('searchbox',{name:'Pesquisar'}).inputValue()==='Beta');
  check('Closing edit preserves list scroll position',Math.abs((await page.evaluate(()=>scrollY))-scroll)<2);
  await edit.click();dialog=page.getByRole('dialog');await dialog.getByLabel(/^Descrição/).fill('Receita sintética revista');await dialog.getByLabel('Vencimento').fill('2028-05-07');
  await page.evaluate(()=>{window.__financialQaFailNext='Falha de rede sintética recuperável.';});await dialog.getByRole('button',{name:'Salvar',exact:true}).click();
  await dialog.getByText('Falha de rede sintética recuperável.',{exact:true}).waitFor();await shot('desktop-revenue-recoverable-error');
  check('Recoverable error preserves typed content',await dialog.getByLabel(/^Descrição/).inputValue()==='Receita sintética revista');
  const first=await page.evaluate(()=>window.__financialQaSaves.at(-1));
  check('Edit preserves payload cents/date/version',first.expectedVersion===3&&first.payload.projected_cents===5000001&&first.payload.confirmed_cents===4500001&&first.payload.due_date==='2028-05-07');
  await dialog.getByRole('button',{name:'Salvar',exact:true}).click();
  await dialog.locator('form[aria-busy="true"]').waitFor();
  const pendingControls = await dialog.evaluate(element => ({
    cancel: [...element.querySelectorAll('button')].find(button => button.textContent.trim()==='Cancelar').matches(':disabled'),
    field: element.querySelector('#rev-desc').matches(':disabled'),
    select: element.querySelector('[role="combobox"]').matches(':disabled'),
  }));
  check('Pending submit locks cancel/fields/selects',Object.values(pendingControls).every(Boolean),pendingControls);
  await page.keyboard.press('Escape');check('Pending dialog remains open through Escape',await dialog.count()===1);
  await dialog.waitFor({state:'hidden'});const retry=await page.evaluate(()=>window.__financialQaSaves.at(-1));
  check('Retry keeps attempt key and closes only after response',first.requestId===retry.requestId);
  check('Save return preserves filters',await page.getByRole('searchbox',{name:'Pesquisar'}).inputValue()==='Beta');
  await page.getByRole('button',{name:'Nova receita',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();
  check('Required field error remains next to field and takes focus',await dialog.getByLabel(/^Descrição/).getAttribute('aria-invalid')==='true'&&await dialog.getByLabel(/^Descrição/).evaluate(e=>document.activeElement===e));await shot('desktop-revenue-required-error');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('searchbox',{name:'Pesquisar',exact:true}).fill('Consulta sem correspondência sintética');
  check('Search without matches preserves filter and shows explicit result state',await page.getByRole('heading',{name:'Nenhuma receita corresponde aos filtros',exact:true}).count()>0&&await page.getByRole('searchbox',{name:'Pesquisar',exact:true}).inputValue()==='Consulta sem correspondência sintética');
  await shot('desktop-revenue-search-empty');
  await go('patrocinios');await page.getByRole('button',{name:/Editar Patrocinador sintético Alpha/}).click();dialog=page.getByRole('dialog');
  await page.evaluate(()=>{window.__financialQaFailNext='O registro foi alterado por outra pessoa. Recarregue e tente novamente.';});await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await dialog.getByText('Conflito de versão',{exact:true}).waitFor();await shot('desktop-sponsorship-version-conflict');
  check('Version conflict preserves sponsorship and actual version',await dialog.getByLabel(/^Patrocinador/).inputValue()==='Patrocinador sintético Alpha'&&(await page.evaluate(()=>window.__financialQaSaves.at(-1))).expectedVersion===5);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  await go('orcamento-comissoes');await page.getByRole('button',{name:'Novo orçamento',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Salvar',exact:true}).click();check('Required commission shows accessible inline error',await dialog.getByRole('combobox',{name:'Comissão'}).getAttribute('aria-invalid')==='true');
  await dialog.getByRole('combobox',{name:'Comissão'}).click();await page.getByRole('option',{name:'Comissão sintética disponível para cadastro',exact:true}).click();await dialog.getByRole('button',{name:'Salvar',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check('Create budget keeps empty cap as null', (await page.evaluate(()=>window.__financialQaSaves.at(-1))).payload.budget_cap_cents===null);
  await go('receitas-projetadas','partial');check('500-record query scope explicitly disclosed',await page.getByText(/500/).count()>0&&await page.getByText(/recorte|limite|parcial/i).count()>0);
  await go('relatorios');const reportLink=page.getByRole('link',{name:'Abrir consulta',exact:true}).first();check('Report links preserve current edition',new URL(await reportLink.getAttribute('href'),origin).searchParams.get('edicao')==='2028');
  for (const [view, name] of [['receitas-projetadas','revenue'],['orcamento-comissoes','budget'],['patrocinios','sponsorship']]) {
    await go(view);
    const details = page.locator('.f28-ledger-desktop .f28-ledger-detail-button').first();
    await details.click();
    check(`Desktop ${name} contextual detail expands within the current ledger`,await details.getAttribute('aria-expanded')==='true');
    await page.evaluate(()=>{
      const table=document.querySelector('.f28-ledger-table-shell');
      window.scrollTo(0,window.scrollY+table.getBoundingClientRect().top-180);
    });
    await shot(`desktop-ledger-${name}-details`);
    if (name==='budget') {
      await page.locator('.f28-ledger-table-shell').evaluate(element=>{element.scrollLeft=element.scrollWidth-element.clientWidth;});
      await shot('desktop-ledger-budget-details-scrolled');
    }
  }
  await page.setViewportSize({width:390,height:844});await go('receitas-projetadas');await page.getByRole('button',{name:'Nova receita',exact:true}).click();dialog=page.getByRole('dialog');
  check('Mobile revenue date retains native date input',await dialog.getByLabel('Vencimento').getAttribute('type')==='date');
  await dialog.getByRole('combobox',{name:'Origem do recurso'}).click();const listbox=page.getByRole('listbox');await listbox.waitFor();
  const select=await listbox.evaluate(e=>{const r=e.getBoundingClientRect();const top=document.elementFromPoint(r.x+Math.min(30,r.width/2),r.y+Math.min(30,r.height/2));return{inside:!!top&&e.contains(top),x:r.x,y:r.y,bottom:r.bottom,right:r.right};});
  check('Mobile select is above dialog and inside viewport',select.inside&&select.x>=0&&select.y>=0&&select.right<=390&&select.bottom<=844,select);await shot('mobile-revenue-select-focus');await page.keyboard.press('Escape');
  const focusable=dialog.locator('input:not([disabled]),button:not([disabled]),textarea:not([disabled])');const last=focusable.last();await last.focus();await page.keyboard.press('Tab');check('Dialog keyboard focus stays within modal',await dialog.evaluate(e=>e.contains(document.activeElement)));
  await page.setViewportSize({width:390,height:480});await dialog.getByLabel('Vencimento').focus();await shot('mobile-short-viewport-revenue');
  const footer=await dialog.locator('.financial-2028-dialog__footer').evaluate(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom};});check('Mobile short viewport keeps footer/save accessible',footer.top>=0&&footer.bottom<=480,footer);
  check('Mobile dialog scroll is local and page has no horizontal overflow',await page.evaluate(()=>{const body=document.querySelector('.financial-2028-dialog__body');return body.scrollHeight>body.clientHeight&&document.documentElement.scrollWidth<=innerWidth;}));
  check('Reduced motion disables operational animations',await dialog.evaluate(e=>getComputedStyle(e).animationName==='none'));
  await page.keyboard.press('Escape');
  for(const [screen,size] of [['desktop',{width:1366,height:768}],['notebook',{width:1024,height:768}],['mobile',{width:390,height:844}]]) {
    await page.setViewportSize(size);await go('orcamento-comissoes');
    await page.getByRole('button',{name:/^Editar(?: orçamento.*)?$/}).first().click();await page.getByRole('dialog').waitFor();await shot(`${screen}-edit-budget`);await page.keyboard.press('Escape');
    await page.getByRole('button',{name:/^(Linha|Adicionar linha)(?:.*)?$/}).first().click();await page.getByRole('dialog').waitFor();await shot(`${screen}-create-budget-line`);await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});await go('dashboard','loading');await shot('mobile-state-loading-dashboard');
  check('Loading keeps explicit status instead of financialzero',await page.getByRole('status').count()>0&&!await page.getByText('R$ 0,00',{exact:true}).count());
  check('No browser JavaScript errors',report.errors.length===0,report.errors);
  if (report.checks.some(item => !item.passed)) process.exitCode = 1;
  await context.close();await browser.close();
}
main().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{await activeBrowser?.close();fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'interaction-results.json'),JSON.stringify(report,null,2));});
