import { describe,expect,it,vi } from 'vitest';
import { questionBank,questionPlaybooks,plannerPlaybooks } from '../../supabase/functions/_shared/workers/question-bank';
import { interpretWorkerIntent } from '../../supabase/functions/_shared/workers/intent';
import { composeWorkerResponse } from '../../supabase/functions/_shared/workers/response-composer';
import { decodeWorkerResponse,encodeWorkerResponse,workerResponseSchema } from '../../supabase/functions/_shared/workers/response-contract';
import { buildPlannerMessages,runWorkerTurn } from '../../supabase/functions/_shared/workers/engine';
import { parseQuestionAnalytics } from '../lib/workers/question-analytics';
import {asksForMutation,type WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';
const now=new Date('2026-10-17T01:00:00-03:00');
const request:WorkerRequest={orgId:'10000000-0000-4000-8000-000000000001',requestId:'20000000-0000-4000-8000-000000000001',worker:'agenda',message:'Faça um gráfico de pizza dos eventos por situação neste mês.'};
const scope={complete:true,as_of:now.toISOString(),timezone:'America/Sao_Paulo',period:{from:'2026-10-01',to:'2026-10-31'},group_by:'status',filters:{relationship:'all'}};
const record={scope,metrics:{total:250,valid_duration_events:200,average_duration_minutes:150},groups:[{label:'Planejado',count:150},{label:'Concluído',count:100}],rows:[{title:'Evento de teste',status:'Planejado',start_date:'2026-10-17',end_date:null,start_time:'10h00',end_time:'12h30',location:'Sala dos Voluntários',category:'Reunião',priority:'Alta'}]};
function evidence(data:unknown=record){return {tool:'agenda_query',input:{},result:{summary:'Agregado completo de teste.',records:[data],citations:[{label:'Agenda',url:'/cronograma-eventos',source:'app' as const}],total:1}};}
const compose=(message:string,records=[evidence()])=>decodeWorkerResponse(composeWorkerResponse({...request,message},interpretWorkerIntent({...request,message},now),records,now).content)!;
describe('Reviewed live-query question bank',()=>{
  it('contains 50 map and 100 agenda questions with unique IDs and a query strategy, never stored answers',()=>{
    expect(questionBank.filter(row=>row.worker==='mapa')).toHaveLength(50);
    expect(questionBank.filter(row=>row.worker==='agenda')).toHaveLength(100);
    expect(new Set(questionBank.map(row=>row.id)).size).toBe(150);
    expect(new Set(questionBank.map(row=>row.question)).size).toBe(150);
    for(const row of questionBank){expect(questionPlaybooks.find(playbook=>playbook.id===row.playbookId)?.strategy.length).toBeGreaterThan(40);expect(row).not.toHaveProperty('answer');}
  });
  it.each(['Me mostra os compromissos que tenho nesta semana','Gostaria de enxergar a programação separada por local','Quais encontros planejei para amanhã?','Há reuniões de prioridade crítica na Agenda?'])('interprets unfamiliar wording without an exact-question gate: %s',message=>{
    const intent=interpretWorkerIntent({...request,message},now);expect(intent.worker).toBe('agenda');expect(intent.kind).toBe('agenda_query');
    expect(buildPlannerMessages({...request,message},now)[0].content).toContain('não exija correspondência literal');
  });
  it('does not answer a personal list with a count-only personal aggregate',()=>{
    expect(interpretWorkerIntent({...request,message:'Quais são meus eventos neste mês?'},now).kind).toBe('agenda_query');
    expect(interpretWorkerIntent({...request,message:'Quantos eventos eu fiz neste mês?'},now).kind).toBe('agenda_personal');
  });
  it('distinguishes refreshing a read from changing business data',()=>{
    expect(asksForMutation('Atualize a disponibilidade depois da nova venda.')).toBe(false);
    expect(asksForMutation('Atualize o cadastro do lote.')).toBe(true);
    expect(asksForMutation('Atualize os dados e confirme a venda.')).toBe(true);
  });
  it('routes ranking paraphrases and creation ownership correctly',()=>{
    expect(interpretWorkerIntent({...request,message:'Quantas pessoas aparecem no ranking deste período?'},now).kind).toBe('agenda_ranking');
    expect(interpretWorkerIntent({...request,message:'Quais são as dez pessoas com mais vínculos na Agenda?'},now).kind).toBe('agenda_ranking');
    expect(interpretWorkerIntent({...request,message:'Qual foi a duração média prevista dos meus eventos criados?'},now).relationship).toBe('created');
    expect(compose('Quantos eventos possuem horários válidos?').summary).toContain('200 de 250');
  });
  it('does not inherit sales overview across an explicit contracts or receipts follow-up',()=>{
    const prior=compose('Quantos eventos eu fiz neste mês?');prior.intent='map_sales';prior.worker='mapa';
    expect(interpretWorkerIntent({...request,worker:'mapa',message:'E quais vendas estão sem contrato?'},now,[{role:'assistant',content:encodeWorkerResponse(prior)}])).toMatchObject({kind:'map_report',commercialSpec:{contractFilter:'without_document'}});
    expect(interpretWorkerIntent({...request,worker:'mapa',message:'E quanto já foi recebido?'},now,[{role:'assistant',content:encodeWorkerResponse(prior)}]).kind).toBe('map_receipts');
  });
  it('routes document-filtered open sales through the complete scoped report, preserving both filters',()=>{
    expect(interpretWorkerIntent({...request,worker:'mapa',message:'Quais vendas em aberto estão sem contrato?'},now)).toMatchObject({kind:'map_report',commercialSpec:{saleStates:['pending'],contractFilter:'without_document'}});
  });
  it.each(['Qual o preço do lote?','Quais estruturas existem no mapa comercial?'])('does not replace distinct map queries with the sales overview: %s',message=>{
    expect(interpretWorkerIntent({...request,worker:'mapa',message},now).kind).toBe('domain_query');
  });
  it('uses word boundaries: indisponível is not available, and explicit availability chooses inventory',()=>{
    expect(interpretWorkerIntent({...request,worker:'mapa',message:'Quantos espaços disponíveis há?'},now).kind).toBe('map_inventory');
    expect(plannerPlaybooks('mapa','indisponiveis')).not.toContain('Referências obrigatórias');
  });
  it('resolves day/week/month civil periods, retaining explicit dates ahead of defaults',()=>{
    expect(interpretWorkerIntent({...request,message:'O que tenho amanhã?'},now).period).toMatchObject({from:'2026-10-18',to:'2026-10-18'});
    expect(interpretWorkerIntent({...request,message:'Quais eventos desta semana?'},now).period).toMatchObject({from:'2026-10-12',to:'2026-10-18'});
    expect(interpretWorkerIntent({...request,message:'Entre 2026-09-10 e 2026-09-20'},now).period).toMatchObject({from:'2026-09-10',to:'2026-09-20'});
    expect(interpretWorkerIntent({...request,message:'O que está marcado entre 10 e 20 de novembro?'},now).period).toMatchObject({from:'2026-11-10',to:'2026-11-20'});
    expect(interpretWorkerIntent({...request,message:'Quais eventos de 20/11/2026 a 25/11/2026?'},now).period).toMatchObject({from:'2026-11-20',to:'2026-11-25'});
    expect(interpretWorkerIntent({...request,message:'Compare os eventos desta semana com a anterior.'},now)).toMatchObject({period:{from:'2026-10-12',to:'2026-10-18'},previousPeriod:{from:'2026-10-05',to:'2026-10-11'}});
  });
  it('builds an entire pie from 250 events even though the illustrative table contains one row',()=>{
    const response=compose(request.message);expect(response.blocks[0]).toMatchObject({type:'pie_chart',data:[{label:'Planejado',value:150},{label:'Concluído',value:100}],population:2});
    expect(response.metadata.completeness).toBe('complete');
    const invalid=structuredClone(response);(invalid.blocks[0] as {population:number}).population=3;expect(workerResponseSchema.safeParse(invalid).success).toBe(false);
    expect(()=>compose(request.message,[evidence({...record,metrics:{...record.metrics,total:251}})])).toThrow('invalid_tool_result');
  });
  it('selects a table for a list and declares its exact coverage',()=>{
    const response=compose('Mostre os eventos deste mês em tabela.');expect(response.blocks[0]).toMatchObject({type:'table',rows:[['Evento de teste','17/10/2026','10h00 – 12h30','Sala dos Voluntários','Planejado']]});
    expect(response.metadata.notes.join(' ')).toContain('todos os 250 eventos');
  });
  it('compares complete periods with identical filters and preserves labels',()=>{
    const message='Compare os eventos deste mês com o anterior.';
    const previous={...record,scope:{...scope,period:{from:'2026-09-01',to:'2026-09-30'}},metrics:{...record.metrics,total:100},groups:[{label:'Planejado',count:100}]};
    const response=compose(message,[evidence(),evidence(previous)]);
    expect(response.blocks[0]).toMatchObject({type:'comparison',currentLabel:'outubro de 2026',previousLabel:'setembro de 2026',items:[{current:250,previous:100}]});
    expect(compose(message,[evidence()]).blocks[0].type).toBe('clarification');
    expect(compose(message,[evidence(),evidence({...previous,scope:{...previous.scope,filters:{relationship:'created'}}})]).blocks[0].type).toBe('clarification');
  });
  it('retains resolved query filters across a new follow-up',()=>{
    const response=compose('Mostre eventos por local neste mês.');response.metadata.filters={query:{group_by:'location',relationship:'linked',location:'Sala dos Voluntários'}};
    const intent=interpretWorkerIntent({...request,message:'e no mês anterior?'},now,[{role:'assistant',content:encodeWorkerResponse(response)}]);
    expect(intent).toMatchObject({kind:'agenda_query',period:{from:'2026-09-01'},queryFilters:{location:'Sala dos Voluntários',relationship:'linked'}});
  });
  it('rejects incomplete tool partitions and invalid inner cells',()=>{
    expect(parseQuestionAnalytics('agenda_query',record)).toMatchObject({metrics:{total:250}});
    expect(()=>parseQuestionAnalytics('agenda_query',{...record,groups:[{label:'Planejado',count:20}]})).toThrow();
    expect(()=>parseQuestionAnalytics('agenda_query',{...record,rows:[{...record.rows[0],extra:'secret'}]})).toThrow();
  });
  it('queries current facts again on each new request instead of caching a preset answer',async()=>{
    let total=250;const executeTool=vi.fn(async()=>evidence({...record,metrics:{...record.metrics,total},groups:[{label:'Planejado',count:total}]}).result);
    const finish=vi.fn();const provider={model:'test',complete:vi.fn().mockResolvedValueOnce({calls:[{id:'1',type:'function',function:{name:'agenda_query',arguments:JSON.stringify({date_from:'2026-10-01',date_to:'2026-10-31'})}}],inputTokens:1,outputTokens:1}).mockResolvedValueOnce({calls:[],inputTokens:1,outputTokens:1})};
    const deps={provider,listTools:async()=>[{name:'agenda_query',title:'Agenda',description:'Test',readOnly:true as const,requiresConfirmation:false as const,inputJsonSchema:{}}],executeTool,begin:async()=>({conversationId:request.orgId,replayed:false}),finish,fail:vi.fn(),now:()=>now};
    await runWorkerTurn(request,deps,()=>{});total=251;
    provider.complete.mockResolvedValueOnce({calls:[{id:'2',type:'function',function:{name:'agenda_query',arguments:'{}'}}],inputTokens:1,outputTokens:1}).mockResolvedValueOnce({calls:[],inputTokens:1,outputTokens:1});
    await runWorkerTurn({...request,requestId:'20000000-0000-4000-8000-000000000002'},deps,()=>{});
    expect(executeTool).toHaveBeenCalledTimes(2);expect(decodeWorkerResponse(finish.mock.calls[0][1].content)?.summary).toContain('250');expect(decodeWorkerResponse(finish.mock.calls[1][1].content)?.summary).toContain('251');
  });
});
