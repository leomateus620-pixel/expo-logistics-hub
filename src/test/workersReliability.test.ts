import {describe,expect,it,vi} from 'vitest';
import {interpretWorkerIntent} from '../../supabase/functions/_shared/workers/intent';
import {runWorkerTurn,type WorkerTurnDependencies} from '../../supabase/functions/_shared/workers/engine';
import {composeWorkerResponse} from '../../supabase/functions/_shared/workers/response-composer';
import {decodeWorkerResponse,encodeWorkerResponse} from '../../supabase/functions/_shared/workers/response-contract';
import type {ReadResult,WorkerRequest} from '../../supabase/functions/_shared/workers/contracts';

const now=new Date('2026-11-05T12:00:00Z');
const request:WorkerRequest={orgId:'10000000-0000-4000-8000-000000000001',requestId:'20000000-0000-4000-8000-000000000001',worker:'mapa',message:'Qual pessoa teve mais eventos no mês de outubro?'};
const personId='30000000-0000-4000-8000-000000000001',otherPerson='30000000-0000-4000-8000-000000000002';
const projectId='40000000-0000-4000-8000-000000000001';
const scope={complete:true,as_of:now.toISOString(),timezone:'America/Sao_Paulo',period:{from:'2026-10-01',to:'2026-10-31'}};
const result=(record:unknown):ReadResult=>({summary:'Consulta sintética identificada para teste.',records:[record],total:1,citations:[{label:'Agenda',url:'/cronograma-eventos',source:'app'}]});
const evidence=(tool:string,record:unknown)=>({tool,input:{},result:result(record)});
const compose=(message:string,tool:string,record:unknown)=>decodeWorkerResponse(composeWorkerResponse({...request,message},interpretWorkerIntent({...request,message},now),[evidence(tool,record)],now).content)!;
const contracts={scope:{complete:true,as_of:now.toISOString(),timezone:'America/Sao_Paulo',project_id:projectId},notes:[],metrics:{total_records:124,pending_records:60,signed_records:64}};
function dependencies(execute:WorkerTurnDependencies['executeTool'],tools:string[],history:Array<{role:string;content:string}>=[]):WorkerTurnDependencies{
  return {provider:{model:'test',complete:vi.fn()},listTools:vi.fn(async()=>tools.map(name=>({name,readOnly:true as const,description:'Consulta',inputJsonSchema:{}}))),executeTool:execute,
    begin:vi.fn(async()=>({conversationId:projectId,replayed:false})),finish:vi.fn(),fail:vi.fn(),history:vi.fn(async()=>history),now:()=>now};
}

describe('BOT FENASOJA entity, metric and failed-turn continuity',()=>{
  it.each([
    ['Qual pessoa teve mais eventos no mês de outubro?','agenda_ranking'],
    ['Qual comissão teve mais eventos?','agenda_commission_ranking'],
    ['Quantos eventos Fabiano Souza teve em outubro?','agenda_person'],
    ['Quantos eventos a comissão Central teve em outubro?','agenda_commission'],
    ['Quantos eventos eu tive em outubro?','agenda_personal'],
    ['Quantos eventos existem em outubro?','agenda_query'],
  ])('selects the requested entity ahead of the open specialist: %s',(message,kind)=>{
    expect(interpretWorkerIntent({...request,message},now)).toMatchObject({kind,worker:'agenda'});
  });
  it('preserves October after an actual failed user question and changes entity independently',()=>{
    const history=[{role:'user',content:request.message},{role:'assistant',content:'A consulta não foi concluída.'}];
    const next=interpretWorkerIntent({...request,message:'e qual comissão teve mais eventos?'},now,history);
    expect(next).toMatchObject({kind:'agenda_commission_ranking',period:{from:'2026-10-01',to:'2026-10-31'}});
    expect(interpretWorkerIntent({...request,message:'e em setembro?'},now,history)).toMatchObject({period:{from:'2026-09-01'}});
  });
  it('distinguishes the official commercial unit and metric',()=>{
    expect(interpretWorkerIntent({...request,message:'Quantos contratos foram firmados?'},now)).toMatchObject({kind:'map_contracts',commercialMetric:'signed_records'});
    expect(interpretWorkerIntent({...request,message:'Quantos contratos aguardam assinatura?'},now)).toMatchObject({kind:'map_contracts',commercialMetric:'pending_records'});
    expect(interpretWorkerIntent({...request,message:'Qual é o total de registros comerciais?'},now)).toMatchObject({kind:'map_contracts',commercialMetric:'total_records'});
    expect(interpretWorkerIntent({...request,message:'Quantos documentos foram anexados?'},now)).toMatchObject({kind:'map_documents',commercialMetric:'documents'});
    expect(interpretWorkerIntent({...request,message:'Quanto já foi recebido das vendas?'},now)).toMatchObject({kind:'map_receipts',commercialMetric:'receipts'});
  });
  it('answers 64 signed groupings, without substituting pending records, lots or files',()=>{
    const signed=compose('Quantos contratos foram firmados?','map_sales_records_summary',contracts);
    expect(signed.summary).toBe('64 contratos com assinatura confirmada.');
    expect(signed.blocks[0]).toMatchObject({type:'indicators',items:[{label:'Contratos com assinatura confirmada',value:64}]});
    expect(compose('Quantos contratos aguardam assinatura?','map_sales_records_summary',contracts).summary).toContain('60 contratos aguardando assinatura');
    const total=compose('Qual é o total de registros comerciais?','map_sales_records_summary',contracts);
    expect(total.summary).toContain('124 registros comerciais');
    const followup=interpretWorkerIntent({...request,message:'e quantos estão pendentes?'},now,[{role:'user',content:'Quantos contratos foram firmados?'},{role:'assistant',content:encodeWorkerResponse(signed)}]);
    expect(followup.commercialMetric).toBe('pending_records');
  });
  it('never promotes explicit contracts to a sales amount because an incorrect tool ran',()=>{
    const answer=compose('Quantos contratos foram firmados?','map_sales_overview',{scope:{...scope,project_id:projectId},metrics:{confirmed_value_cents:999999}});
    expect(answer.metadata.completeness).toBe('unavailable');
    expect(JSON.stringify(answer.blocks)).not.toContain('999999');
  });
  it('separates homonyms by persisted identity and describes the lead and tie',()=>{
    const ranked={scope,metrics:{people_count:2,event_count:10},people:[{person_id:personId,name:'Nome Homônimo',events:8,position:1},{person_id:otherPerson,name:'Nome Homônimo',events:8,position:2}]};
    const answer=compose('Mostre um gráfico das pessoas com mais eventos em outubro.','agenda_people_ranking',ranked);
    expect(answer.summary).toContain('Empate na liderança');
    expect(answer.blocks[0]).toMatchObject({type:'entity_ranking',items:[{id:personId,name:'Nome Homônimo',events:8},{id:otherPerson,name:'Nome Homônimo',events:8}]});
    const chart=answer.blocks.find(block=>block.type==='bar_chart');
    expect(chart?.type==='bar_chart'&&new Set(chart.data.map(item=>item.label)).size).toBe(2);
  });
  it('uses commissions separately and does not require a partition of events',()=>{
    const answer=compose('Mostre um gráfico de pizza da comissão com mais eventos em outubro.','agenda_commission_ranking',{
      scope,metrics:{commission_count:2,event_count:2},commissions:[{commission_id:personId,name:'Central',slug:'central',events:2,position:1},{commission_id:otherPerson,name:'Logística',slug:'logistica',events:2,position:2}],
    });
    expect(answer.blocks[0]).toMatchObject({type:'entity_ranking',entityKind:'commission'});
    expect(answer.blocks.find(block=>block.type==='bar_chart')).toBeTruthy();
    expect(answer.blocks.find(block=>block.type==='pie_chart')).toBeUndefined();
    expect(answer.metadata.notes.join(' ')).toContain('mais de uma comissão');
  });
  it('resolves a named person before querying the persistent ID, without the authenticated-user tool',async()=>{
    const execute=vi.fn(async(name:string)=>name==='agenda_resolve_identity'?result({complete:true,identities:[{id:personId,name:'Fabiano Souza',kind:'person'}]}):result({scope,notes:[],person:{id:personId,name:'Fabiano Souza',kind:'person'},metrics:{events:17}}));
    const deps=dependencies(execute,['agenda_resolve_identity','agenda_person_events','agenda_personal_summary']);
    await runWorkerTurn({...request,message:'Quantos eventos Fabiano Souza teve em outubro?'},deps,()=>{});
    expect(execute).toHaveBeenNthCalledWith(1,'agenda_resolve_identity',{kind:'person',search:'Fabiano Souza'});
    expect(execute).toHaveBeenNthCalledWith(2,'agenda_person_events',{person_id:personId,date_from:'2026-10-01',date_to:'2026-10-31'});
    const response=decodeWorkerResponse(vi.mocked(deps.finish).mock.calls[0][1].content)!;
    expect(response.summary).toContain('Fabiano Souza tem 17 eventos vinculados');
    expect(response.blocks[0]).toMatchObject({type:'entity_ranking',items:[{id:personId,name:'Fabiano Souza',events:17}]});
    expect(execute.mock.calls.some(([name])=>name==='agenda_personal_summary')).toBe(false);
  });
  it('asks an objective choice on ambiguity and revalidates the selected ID in authorized candidates',async()=>{
    const identities={complete:true,identities:[{id:personId,name:'Fabiano Souza',kind:'person'},{id:otherPerson,name:'Fabiano Souza',kind:'person'}]};
    const execute=vi.fn(async(name:string)=>name==='agenda_resolve_identity'?result(identities):result({scope,notes:[],person:{id:otherPerson,name:'Fabiano Souza',kind:'person'},metrics:{events:7}}));
    const deps=dependencies(execute,['agenda_resolve_identity','agenda_person_events']);
    const initial={...request,message:'Quantos eventos Fabiano Souza teve em outubro?'};
    await runWorkerTurn(initial,deps,()=>{});
    expect(execute).toHaveBeenCalledTimes(1);
    const content=vi.mocked(deps.finish).mock.calls[0][1].content;
    expect(decodeWorkerResponse(content)?.blocks[0]).toMatchObject({type:'clarification',options:['Fabiano Souza · identidade 1','Fabiano Souza · identidade 2'],choices:[{id:personId,name:'Fabiano Souza'},{id:otherPerson,name:'Fabiano Souza'}]});
    deps.history=vi.fn(async()=>[{role:'user',content:initial.message},{role:'assistant',content}]);
    await runWorkerTurn({...initial,conversationId:projectId,message:`Fabiano Souza · ${otherPerson}`},deps,()=>{});
    expect(execute).toHaveBeenLastCalledWith('agenda_person_events',{person_id:otherPerson,date_from:'2026-10-01',date_to:'2026-10-31'});
  });
  it('calls only the official summary tool for a confirmed-contract question',async()=>{
    const execute=vi.fn(async()=>result(contracts));const deps=dependencies(execute,['map_sales_records_summary','map_sales_overview']);
    await runWorkerTurn({...request,message:'Quantos contratos foram firmados?'},deps,()=>{});
    expect(execute).toHaveBeenCalledExactlyOnceWith('map_sales_records_summary',{});
    expect(deps.provider.complete).not.toHaveBeenCalled();
  });
  it('accepts an ordinal ambiguity choice and retains its identity on the next period',async()=>{
    const identities={complete:true,identities:[{id:personId,name:'Fabiano Souza',kind:'person'},{id:otherPerson,name:'Fabiano Souza',kind:'person'}]};
    const execute=vi.fn(async(name:string)=>name==='agenda_resolve_identity'?result(identities):result({scope,notes:[],person:{id:otherPerson,name:'Fabiano Souza',kind:'person'},metrics:{events:7}}));
    const deps=dependencies(execute,['agenda_resolve_identity','agenda_person_events']);
    const message='Quantos eventos Fabiano Souza teve em outubro?';
    await runWorkerTurn({...request,message},deps,()=>{});
    const clarification=vi.mocked(deps.finish).mock.calls[0][1].content;
    deps.history=vi.fn(async()=>[{role:'user',content:message},{role:'assistant',content:clarification}]);
    await runWorkerTurn({...request,conversationId:projectId,message:'a segunda'},deps,()=>{});
    expect(execute).toHaveBeenLastCalledWith('agenda_person_events',{person_id:otherPerson,date_from:'2026-10-01',date_to:'2026-10-31'});
    const answer=vi.mocked(deps.finish).mock.calls[1][1].content;
    const next=interpretWorkerIntent({...request,message:'e em setembro?'},now,[{role:'user',content:message},{role:'assistant',content:clarification},{role:'user',content:'a segunda'},{role:'assistant',content:answer}]);
    expect(next).toMatchObject({kind:'agenda_person',entityId:otherPerson,entitySearch:'Fabiano Souza',period:{from:'2026-09-01'}});
  });
  it('preserves accented identity search and does not turn a requested value into contract counts',()=>{
    expect(interpretWorkerIntent({...request,message:'Quantos eventos João Antônio teve em outubro?'},now)).toMatchObject({kind:'agenda_person',entitySearch:'João Antônio'});
    expect(interpretWorkerIntent({...request,message:'Qual é o valor dos contratos firmados?'},now).kind).not.toBe('map_contracts');
  });
});
