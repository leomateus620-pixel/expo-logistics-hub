// Real Agenda components with an intercepted synthetic, read-only dataset.
// No app route, authenticated backend connection, or production write is used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.AGENDA_QA_BASE || 'http://127.0.0.1:5197';
const output = path.resolve('docs/validation/agenda-restaurant/evidence');
fs.mkdirSync(output, { recursive: true });
const report = { boundary: 'Synthetic local read-only module mocks; external requests intercepted; no production writes', checks: [], errors: [], blockedWrites: [], captures: [] };
const check = (name, passed, detail) => { report.checks.push({name, passed, detail}); console.log(JSON.stringify(report.checks.at(-1))); assert(passed, name); };
const eventTitle = title => new RegExp('^'+title+'$','i');
const hookMocks = {
  '/src/hooks/useAuth.ts': `const user = {id:'70000000-0000-4000-8000-000000000001',user_metadata:{full_name:'Pessoa de teste'}}; export function useAuth(){return {user,loading:false,signOut:async()=>{}}}`,
  '/src/hooks/useCurrentOrg.ts': `export function useCurrentOrg(){return {orgId:'50000000-0000-4000-8000-000000000001',myRole:'admin',membership:{nome_exibicao:'Pessoa de teste'},isLoading:false,hasOrg:true}}`,
  '/src/hooks/useCapabilities.ts': `const caps=new Set(['cronograma_eventos_access','cronograma_eventos_write']);export function useCapabilities(){return {capSet:caps,hasCapability:()=>true,hasFullAccess:true,isLoading:false}}`,
  '/src/hooks/useCronogramaEventos.ts': `const action={isPending:false,error:null,reset(){},async mutateAsync(){throw new Error('Cenário local somente leitura')},mutate(){throw new Error('Cenário local somente leitura')}};
    export function cronogramaEventsQueryKey(org){return ['cronograma-eventos',org]}
    export async function fetchCronogramaDatasetForOrg(){return {events:window.__agendaQaEvents,deletedSourceKeys:[]}}
    export function useCronogramaEventHistory(){return {entries:[],isLoading:false,canViewHistory:true,error:null}}
    export function useCronogramaEventos(){return {events:window.__agendaQaEvents,isLoading:false,isSeedFallback:false,canManage:false,canWriteEvents:false,canDeleteSubevents:false,pendingRelationshipCount:0,failedRelationshipCount:0,relationshipSyncUnavailable:false,isRefreshing:false,isSyncingRelationships:false,refetch:async()=>{},retryRelationships:async()=>{},create:action,update:action,deleteEvent:action,createSubevent:action,updateSubevent:action,deleteSubevent:action,saveSubeventPlan:action}}`,
  '/src/hooks/useCronogramaDashboardActivity.ts': `export function useCronogramaDashboardActivity(){return {logs:[],status:'empty',isLoading:false,error:null,refetch:async()=>{}}}`,
};

(async () => {
  console.log('Launching isolated Chrome');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    for (const width of [1366, 768, 390, 320]) {
      const context = await browser.newContext({ viewport: {width, height:844}, timezoneId:'America/Sao_Paulo', locale:'pt-BR', reducedMotion:'reduce' });
      const page = await context.newPage();
      console.log(`Loading actual Agenda components at width ${width}`);
      page.setDefaultTimeout(25000);
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if(message.type()==='error') console.log('Browser: '+message.text().slice(0,400)); });
      await page.clock.setFixedTime(new Date('2026-10-06T12:00:00-03:00'));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === base) {
          if (url.pathname === '/__agenda-restaurant-qa') {
            const entry = '/@fs/' + path.join(__dirname,'browser-qa.tsx').replaceAll('\\','/');
            return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><body style="margin:0"><div id="agenda-qa-root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;await import('${entry}');</script></body></html>`});
          }
          if (hookMocks[url.pathname]) return route.fulfill({contentType:'application/javascript',body:hookMocks[url.pathname]});
          return route.continue();
        }
        if (route.request().method() !== 'GET') report.blockedWrites.push({path:url.pathname,method:route.request().method()});
        return route.fulfill({contentType:'application/json',body:'[]',headers:{'content-range':'0-0/0'}});
      });
      await page.goto(base+'/__agenda-restaurant-qa', {waitUntil:'commit'});
      console.log('Local HTML loaded');
      await page.locator('#cronograma-main').waitFor({timeout:60000});
      const general = page.getByRole('button',{name:'Agenda geral',exact:true});
      const room = page.getByRole('button',{name:'Sala dos Voluntários',exact:true});
      await general.waitFor();
      check(`${width}: general is initial mode`,await general.getAttribute('aria-pressed')==='true');
      check(`${width}: Portal visible`,await page.getByRole('link',{name:'Voltar ao portal de acesso',exact:true}).isVisible());
      check(`${width}: room control visible`,await room.isVisible());
      await page.screenshot({path:path.join(output,`${width}-general.png`),animations:'disabled'});
      await room.focus(); await page.keyboard.press('Enter');
      check(`${width}: room activates by keyboard`,await room.getAttribute('aria-pressed')==='true');
      const main = page.locator('#cronograma-main');
      await main.getByText(eventTitle('QA sala canônica')).first().waitFor();
      check(`${width}: canonical room and historical full name retained`,await main.getByText(eventTitle('QA sala histórica')).count()>0);
      for (const title of ['QA centro de eventos','QA código divergente','QA nome parcial']) {
        check(`${width}: exact scope excludes ${title}`,await main.getByText(eventTitle(title)).count()===0);
      }
      await page.screenshot({path:path.join(output,`${width}-room.png`),animations:'disabled'});
      if (width===1366) await page.locator('.cronograma-agenda-modes').screenshot({path:path.join(output,'compact-mode-controls.png'),animations:'disabled'});
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      check(`${width}: no horizontal overflow`,!overflow);
      const touch = await room.boundingBox();
      check(`${width}: comfortable mode target`,touch.width>=40&&touch.height>=40,touch);
      let search = page.getByRole('searchbox',{name:'Buscar no cronograma',exact:true}).filter({visible:true}).first();
      if (!(await search.isVisible().catch(()=>false))) {
        const toggle = page.getByRole('button',{name:/Abrir busca|Buscar eventos|Buscar na agenda/}).first();
        await toggle.click();
        search = page.getByRole('searchbox',{name:'Buscar no cronograma',exact:true}).filter({visible:true}).first();
      }
      if (!(await search.count())) search = page.locator('input[type="search"]').filter({visible:true}).first();
      await search.fill('histórica');
      await page.waitForTimeout(400);
      check(`${width}: search combines with room`,await main.getByText(eventTitle('QA sala histórica')).count()>0&&await main.getByText(eventTitle('QA sala canônica')).count()===0);
      await general.click();
      check(`${width}: switching mode preserves search`,await search.inputValue()==='histórica');
      await room.click();
      await page.getByRole('button',{name:'Limpar busca',exact:true}).click();
      await page.waitForTimeout(400);
      check(`${width}: clear search keeps room mode`,await room.getAttribute('aria-pressed')==='true');
      if(width===1366) {
        for(const [view,present,absent] of [['Pendências','QA sala atrasada','QA centro atrasado'],['Histórico concluído','QA sala concluída','QA centro concluído']]) {
          await page.getByRole('button',{name:view,exact:true}).first().click();
          await main.getByText(new RegExp('^'+present+'$','i')).first().waitFor();
          check(`room ${view}: own partition remains scoped`,await main.getByText(new RegExp('^'+absent+'$','i')).count()===0);
        }
        await page.getByRole('button',{name:'Calendário',exact:true}).first().click();
        await page.getByRole('button',{name:'Ano anterior',exact:true}).click();
        await page.getByRole('button',{name:'Ano anterior',exact:true}).click();
        await page.getByRole('button',{name:'Selecionar 7 de Outubro de 2026',exact:true}).click();
        await main.getByText('QA sala canônica',{exact:true}).first().waitFor();
        await page.screenshot({path:path.join(output,'1366-room-calendar.png'),animations:'disabled'});
        check('room calendar excludes other locations',await main.getByText(/QA centro de eventos/i,{exact:true}).count()===0);
        await page.getByRole('button',{name:'Dashboard',exact:true}).first().click();
        await page.locator('.cronograma-dashboard').first().waitFor();
        check('room dashboard excludes other locations',await main.getByText('QA centro de eventos',{exact:true}).count()===0);
        await page.screenshot({path:path.join(output,'1366-room-dashboard.png'),animations:'disabled'});
      }
      report.captures.push({width,overflow,touch});
      await context.close();
    }
    check('No browser runtime errors',report.errors.length===0,report.errors);
    check('No production writes attempted',report.blockedWrites.length===0,report.blockedWrites);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1});
