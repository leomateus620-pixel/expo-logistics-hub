import { z } from 'zod';
import { WorkerToolError } from './types.ts';

const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const finite=z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text=z.string().min(1).max(500);
const scope=z.object({
  timezone:z.literal('America/Sao_Paulo'),complete:z.literal(true),as_of:z.string().datetime({offset:true}),
  period:z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict().optional(),
  project_id:z.string().uuid().optional(),project_name:text.optional(),edition_year:z.number().int().min(2000).max(2200).optional(),edition_label:text.optional(),
  unit:z.enum(['BRL_cents','events']).optional(),relationship:z.enum(['linked','created','responsible']).optional(),
  duration_basis:z.literal('full_scheduled_event').optional(),subevents:z.literal('deduplicated_parent').optional(),cancelled:z.literal('excluded').optional(),
}).strict();
const notes=z.array(text).max(8);
const map=z.object({scope,notes,metrics:z.object({
  confirmed_value_cents:count,open_value_cents:count,confirmed_orders:count,open_orders:count,
  confirmed_lots:count,open_lots:count,legacy_lots:count,cancelled_lots:count,unverified_lots:count,
  missing_value_lots:count,unallocated_lots:count,unknown_period_lots:count,
}).strict()}).strict();
const personal=z.object({scope,notes,metrics:z.object({
  events:count,created_events:count,responsible_events:count,linked_events:count,completed_events:count,past_events:count,
  scheduled_events:count,valid_duration_events:count,average_duration_minutes:finite.nullable(),
  weekday_counts:z.array(z.object({weekday:z.number().int().min(0).max(6),events:count}).strict()).max(7),
}).strict()}).strict();
const ranking=z.object({scope,notes,metrics:z.object({people_count:count,event_count:count,unidentified_links:count,
  shown_people:z.number().int().min(1).max(30),tie_break:z.literal('name_then_id')}).strict(),
  people:z.array(z.object({person_id:z.string().uuid(),name:text,events:count,position:count}).strict()).max(30),
}).strict();
const identity=z.object({id:z.string().uuid(),name:text,kind:z.enum(['person','commission']),visual_key:z.string().regex(/^[a-z0-9_-]{1,100}$/).optional()}).strict();
const identities=z.object({complete:z.literal(true),identities:z.array(identity)}).strict();
const personEvents=z.object({scope,notes,person:identity.extend({kind:z.literal('person')}),metrics:z.object({events:count}).strict()}).strict();
const commissionRanking=z.object({scope,notes,metrics:z.object({commission_count:count,event_count:count,
  shown_commissions:z.number().int().min(1).max(30),tie_break:z.literal('name_then_id')}).strict(),
  commissions:z.array(z.object({commission_id:z.string().uuid(),name:text,slug:z.string().regex(/^[a-z0-9_-]{1,100}$/),events:count,position:count}).strict()).max(30),
}).strict();
const clarification=z.object({needs_clarification:z.literal(true),question:text,options:z.array(text).max(100)}).strict();

/** Database output is validated too: a stale or malformed RPC cannot become an
 * apparently complete total. Arrays contain aggregates, never capped raw rows. */
export function parseWorkerAnalytics(tool:string,value:unknown):Record<string,unknown>{
  const schema=tool==='map_sales_overview'?z.union([map,clarification]):tool==='agenda_personal_summary'?personal
    :tool==='agenda_people_ranking'?ranking:tool==='agenda_commission_ranking'?commissionRanking
    :tool==='agenda_resolve_identity'?identities:tool==='agenda_person_events'?personEvents:undefined;
  if(!schema) throw new WorkerToolError('INVALID_RESPONSE','Resultado de consulta não reconhecido.',{stage:'validation'});
  const parsed=schema.safeParse(value);
  if(!parsed.success) throw new WorkerToolError('INVALID_RESPONSE','Não foi possível verificar o resultado desta consulta.',{stage:'validation'});
  if(tool==='map_sales_overview'&&'metrics' in parsed.data){
    const result=map.parse(parsed.data);
    if(!result.scope.project_id||!result.scope.edition_year||!result.scope.edition_label||!result.scope.project_name)
      throw new WorkerToolError('INVALID_RESPONSE','Não foi possível verificar a edição deste resultado.',{stage:'validation'});
  }
  if(tool==='agenda_personal_summary'){
    const result=personal.parse(parsed.data),metrics=result.metrics;
    const selected=result.scope.relationship==='created'?metrics.created_events:result.scope.relationship==='responsible'?metrics.responsible_events:metrics.linked_events;
    if(!result.scope.period||metrics.events!==selected||metrics.valid_duration_events>metrics.events
      ||metrics.completed_events>metrics.events||metrics.past_events>metrics.events||metrics.scheduled_events>metrics.events
      ||(metrics.valid_duration_events===0)!==(metrics.average_duration_minutes===null)
      ||metrics.weekday_counts.reduce((sum,row)=>sum+row.events,0)!==metrics.events
      ||new Set(metrics.weekday_counts.map(row=>row.weekday)).size!==metrics.weekday_counts.length)
      throw new WorkerToolError('INVALID_RESPONSE','Não foi possível verificar os totais da sua Agenda.',{stage:'validation'});
  }
  if(tool==='agenda_people_ranking'&&'people' in parsed.data){
    const result=ranking.parse(parsed.data),people=result.people;
    if(!result.scope.period||result.metrics.people_count<people.length||people.length>result.metrics.shown_people
      ||people.some((person,index)=>person.position!==index+1||person.events>result.metrics.event_count
        ||(index>0&&person.events>people[index-1].events))
      ||new Set(people.map(person=>person.person_id)).size!==people.length)
      throw new WorkerToolError('INVALID_RESPONSE','Não foi possível distinguir as pessoas deste resultado.',{stage:'validation'});
  }
  if(tool==='agenda_commission_ranking'){
    const result=commissionRanking.parse(parsed.data),rows=result.commissions;
    if(!result.scope.period||result.metrics.commission_count<rows.length||rows.length>result.metrics.shown_commissions
      ||new Set(rows.map(row=>row.commission_id)).size!==rows.length
      ||rows.some((row,index)=>row.position!==index+1||row.events>result.metrics.event_count||(index>0&&row.events>rows[index-1].events)))
      throw new WorkerToolError('INVALID_RESPONSE','Não foi possível verificar o ranking das comissões.',{stage:'validation'});
  }
  if(tool==='agenda_person_events'&&!personEvents.parse(parsed.data).scope.period)
    throw new WorkerToolError('INVALID_RESPONSE','Não foi possível verificar o período da consulta.',{stage:'validation'});
  if(tool==='agenda_resolve_identity'){
    const result=identities.parse(parsed.data);
    if(new Set(result.identities.map(row=>row.id)).size!==result.identities.length)
      throw new WorkerToolError('INVALID_RESPONSE','Identidades duplicadas no resultado.',{stage:'validation'});
  }
  return parsed.data;
}
