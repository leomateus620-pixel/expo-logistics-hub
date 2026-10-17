import {describe,it,expect} from 'vitest';
import {parseWorkerAnalytics} from '../analytics.ts';
import {agendaTools} from '../tools/agenda/index.ts';
import {mapaTools} from '../tools/mapa/index.ts';
import {readFileSync} from 'node:fs';
const scope={timezone:'America/Sao_Paulo',complete:true,as_of:'2026-10-17T02:00:00Z',period:{from:'2026-10-01',to:'2026-10-31'}};
const personal=()=>({scope,notes:[],metrics:{events:124,linked_events:124,created_events:124,responsible_events:124,
  completed_events:1,past_events:2,scheduled_events:123,valid_duration_events:123,average_duration_minutes:180,
  weekday_counts:[{weekday:4,events:124}]}});
const ranking=()=>({scope,notes:[],metrics:{people_count:120,event_count:500,unidentified_links:0,shown_people:1,tie_break:'name_then_id'},
  people:[{person_id:'10000000-0000-4000-8000-000000000001',name:'Ana Maria da Silva',events:124,position:1}]});
describe('verified aggregate output contracts',()=>{
  it('validates the actual PostgreSQL synthetic examples without changing their amounts or counts',()=>{
    const {examples}=JSON.parse(readFileSync(`${process.cwd()}/docs/workers/bot-fenasoja/analytics-validation.json`,'utf8'));
    expect(parseWorkerAnalytics('map_sales_overview',examples.map)).toEqual(examples.map);
    expect(parseWorkerAnalytics('agenda_personal_summary',examples.agenda)).toEqual(examples.agenda);
    expect(parseWorkerAnalytics('agenda_people_ranking',examples.ranking)).toEqual(examples.ranking);
    expect(examples.map.metrics.confirmed_value_cents).toBe(1_500_000);
    expect(examples.agenda.metrics.events).toBe(124);
  });
  it('accepts a complete count larger than listing limits and retains the visual limit separately',()=>{
    expect(parseWorkerAnalytics('agenda_personal_summary',personal()).metrics).toMatchObject({events:124});
    expect(parseWorkerAnalytics('agenda_people_ranking',ranking()).metrics).toMatchObject({event_count:500,people_count:120});
  });
  it.each([NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])('rejects invalid numerical output %s',bad=>{
    const data=personal();data.metrics.events=bad;
    expect(()=>parseWorkerAnalytics('agenda_personal_summary',data)).toThrow();
  });
  it('rejects a partial sample labelled complete, inconsistent duration denominator and missing period',()=>{
    expect(()=>parseWorkerAnalytics('agenda_people_ranking',{...ranking(),scope:{...scope,complete:false}})).toThrow();
    const data=personal();data.metrics.valid_duration_events=125;
    expect(()=>parseWorkerAnalytics('agenda_personal_summary',data)).toThrow();
    expect(()=>parseWorkerAnalytics('agenda_people_ranking',{...ranking(),scope:{timezone:scope.timezone,complete:true,as_of:scope.as_of}})).toThrow();
  });
  it('requires weekday counts to represent the exact same selected events',()=>{
    const data=personal();data.metrics.weekday_counts=[{weekday:1,events:12}];
    expect(()=>parseWorkerAnalytics('agenda_personal_summary',data)).toThrow();
  });
  it('rejects duplicate identities or indistinguishable chart labels',()=>{
    const data=ranking();data.metrics.shown_people=2;data.people.push({...data.people[0],position:2});
    expect(()=>parseWorkerAnalytics('agenda_people_ranking',data)).toThrow();
    data.people[1].person_id='10000000-0000-4000-8000-000000000002';
    expect(()=>parseWorkerAnalytics('agenda_people_ranking',data)).toThrow();
  });
  it('fails closed on arbitrary fields, incomplete blocks, or free chart configuration',()=>{
    expect(()=>parseWorkerAnalytics('agenda_personal_summary',{...personal(),html:'<script/>'})).toThrow();
    expect(()=>parseWorkerAnalytics('agenda_people_ranking',{...ranking(),chart:{formatter:'alert(1)'}})).toThrow();
    expect(()=>parseWorkerAnalytics('map_sales_overview',{metrics:{confirmed_value_cents:1}})).toThrow();
  });
  it('accepts a specific clarification instead of guessing the edition/project',()=>{
    expect(parseWorkerAnalytics('map_sales_overview',{needs_clarification:true,question:'Qual edição deseja consultar?',options:['Fenasoja 2028']})).toMatchObject({needs_clarification:true});
  });
  it('keeps read-only tools closed and accepts only dates, explicit project scope and known relationship types',()=>{
    const personal=agendaTools.find(tool=>tool.name==='agenda_personal_summary')!;
    expect(personal.inputSchema.safeParse({date_from:'2026-10-01',date_to:'2026-10-31',relationship:'attended'}).success).toBe(false);
    expect(personal.inputSchema.safeParse({date_from:'2026-10-01',date_to:'2026-10-31',user_id:'someone-else'}).success).toBe(false);
    expect(mapaTools.find(tool=>tool.name==='map_sales_overview')?.capability.policy).toBe('map_sales');
  });
});
