/** Deterministic fixture records, passed through the production intent/composition/validation pipeline. */
import { composeWorkerResponse, type ToolEvidence } from '../../supabase/functions/_shared/workers/response-composer';
import { interpretWorkerIntent } from '../../supabase/functions/_shared/workers/intent';
import type { WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';

export function responseFixture(input: { orgId: string; requestId: string; conversationId?: string; worker?: string; message: string }, history: Array<{ role: string; content: string }>) {
  const request = input as WorkerRequest;
  const now = new Date('2026-10-16T21:00:00-03:00');
  const intent = interpretWorkerIntent(request, now, history);
  const scope = { complete: true, ...(intent.kind.startsWith('map_')?{edition_year:2028,project_id:'50000000-0000-4000-8000-000000000001',project_name:'Mapa sintético · Fenasoja 2028'}:{}), as_of: now.toISOString(),...(intent.period?{period:{from:intent.period.from,to:intent.period.to}}:{}) };
  const evidence: ToolEvidence[] = [];
  const add = (tool: string, record: Record<string, unknown>, url: string, label: string) => evidence.push({ tool, input: {}, result: { summary: 'Dados de teste identificados; conjunto completo da fixture.', records: [record], citations: [{ label, url, source: 'app' }], total: 1 } });
  if (intent.kind === 'map_sales') add('map_sales_overview', { scope, metrics: { confirmed_value_cents: 123456700, open_value_cents: 34567800, confirmed_orders: 124, confirmed_lots: 321, open_orders: 96, open_lots: 268, legacy_lots: 57 } }, '/mapa-comercial', 'Mapa Comercial · dados de teste');
  else if(intent.kind==='agenda_query') {
    const question=input.message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const group_by=/por local/.test(question)?'location':/categoria/.test(question)?'category':/dia/.test(question)?'weekday':'status';
    const labels=group_by==='location'?['Centro de Eventos','Sala dos Voluntários']:group_by==='category'?['Reuniões','Programação institucional']:group_by==='weekday'?['Quinta-feira','Sexta-feira']:['Planejado','Concluído'];
    const record={scope:{...scope,group_by,filters:{relationship:'all'}},metrics:{total:240,valid_duration_events:200,average_duration_minutes:150},groups:[{label:labels[0],count:150},{label:labels[1],count:90}],rows:[{title:'Reunião de alinhamento · teste',status:'Planejado',start_date:'2026-10-20',end_date:null,start_time:'09h00',end_time:'11h30',location:'Centro de Eventos',category:'Reunião',priority:'Alta'}]};
    add('agenda_query',record,'/cronograma-eventos','Agenda · dados de teste');
    if(intent.previousPeriod)add('agenda_query',{...record,scope:{...record.scope,period:{from:intent.previousPeriod.from,to:intent.previousPeriod.to}},metrics:{...record.metrics,total:180},groups:[{label:labels[0],count:100},{label:labels[1],count:80}]},'/cronograma-eventos','Agenda · dados de teste');
  }
  else if(intent.kind==='map_inventory')add('map_inventory_summary',{scope:{...scope,group_by:'status',filters:{}},metrics:{total:500,area_sqm:45000,missing_area:0},groups:[{label:'Disponível',count:200},{label:'Vendido',count:250},{label:'Venda em andamento',count:50}],rows:[{name:'Espaço comercial de teste',number:'14',block:'A',status:'Disponível',area_sqm:90,covered:true,electricity:true,water:false,internet:false}]},'/mapa-comercial','Mapa Comercial · dados de teste');
  else if (intent.kind === 'agenda_personal') add('agenda_personal_summary', { scope, metrics: { events: 15, past_events: 12, scheduled_events: 3, valid_duration_events: 12, average_duration_minutes: 150 } }, '/cronograma-eventos', 'Agenda · dados de teste');
  else if (intent.kind === 'agenda_ranking') add('agenda_people_ranking', { scope, people_count: 125, people: [{ name: 'Ana Maria de Souza', events: 120 }, { name: 'Carlos Eduardo Rodrigues', events: 115 }, { name: 'Mariana Cristina Ferreira', events: 115 }, { name: 'José Antônio da Silva', events: 94 }, { name: 'Ana Maria de Souza Santos', events: 87 }] }, '/cronograma-eventos', 'Agenda · dados de teste');
  else if (intent.kind === 'institutional_president') evidence.push({ tool: 'workers_institutional_president', input: {}, result: { summary: 'Conteúdo oficial simulado exclusivamente na prévia local.', total: 1, records: [{ evidence_kind: 'official_content', name: 'Fabiano Soltis', role: 'Presidente', edition: 'Fenasoja 2028', verified_on: '2026-10-16', published_on: '2026-09-08' }], citations: [{ label: 'Publicação institucional · referência da fixture', url: 'https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/', source: 'web', date: '2026-09-08' }] } });
  else return null;
  return { ...composeWorkerResponse(request, intent, evidence, now), worker: intent.worker };
}
