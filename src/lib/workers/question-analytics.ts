import { z } from 'zod';
import { WorkerToolError } from './types.ts';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const amount = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(500);
const filters = z.object({ relationship:z.enum(['all','linked','created','responsible']).optional(), status:text.optional(), search:text.optional(),location:text.optional(),category:text.optional(),priority:text.optional(),weekday:z.number().int().min(0).max(6).optional(),commission_id:z.string().uuid().optional(),block:text.optional(),min_area:amount.optional(),max_area:amount.optional(),covered:z.boolean().optional(),electricity:z.boolean().optional(),water:z.boolean().optional(),internet:z.boolean().optional(),missing_number:z.boolean().optional(),missing_area:z.boolean().optional(),missing_time:z.boolean().optional(),missing_location:z.boolean().optional(),missing_category:z.boolean().optional(),cross_midnight:z.boolean().optional(),cross_period:z.boolean().optional(),start_in_period:z.boolean().optional() }).strict();
const scope = z.object({ complete:z.literal(true),as_of:z.string().datetime({offset:true}),timezone:z.literal('America/Sao_Paulo'),period:z.object({from:text,to:text}).strict().optional(),project_id:z.string().uuid().optional(),project_name:text.optional(),edition_year:z.number().int().optional(),edition_label:text.optional(),group_by:z.enum(['status','block','location','category','weekday','day']),filters }).strict();
const common = {scope,groups:z.array(z.object({label:z.string().min(1).max(180),count}).strict()).max(20)};
const inventory = z.object({...common,metrics:z.object({total:count,area_sqm:amount,missing_area:count}).strict(),rows:z.array(z.object({name:text,number:text.nullable(),block:text.nullable(),status:text,area_sqm:amount.nullable(),covered:z.boolean(),electricity:z.boolean(),water:z.boolean(),internet:z.boolean()}).strict()).max(20)}).strict();
const agenda = z.object({...common,metrics:z.object({total:count,valid_duration_events:count,average_duration_minutes:amount.nullable()}).strict(),rows:z.array(z.object({title:text,status:text,start_date:text.nullable(),end_date:text.nullable(),start_time:text.nullable(),end_time:text.nullable(),location:text.nullable(),category:text,priority:text}).strict()).max(20)}).strict();
const clarification=z.object({needs_clarification:z.literal(true),question:text,options:z.array(text).max(100)}).strict();
export function parseQuestionAnalytics(tool:string,value:unknown):Record<string,unknown> {
  const parsed=(tool==='map_inventory_summary'?z.union([inventory,clarification]):agenda).safeParse(value);
  if(!parsed.success)throw new WorkerToolError('DATA_UNAVAILABLE','Não foi possível verificar os dados solicitados.');
  if('metrics' in parsed.data){
    const data=parsed.data;
    if(data.groups.reduce((sum,group)=>sum+group.count,0)!==data.metrics.total||new Set(data.groups.map(group=>group.label)).size!==data.groups.length||data.rows.length>data.metrics.total
      ||('valid_duration_events' in data.metrics&&(data.metrics.valid_duration_events>data.metrics.total||(data.metrics.valid_duration_events===0)!==(data.metrics.average_duration_minutes===null))))throw new WorkerToolError('DATA_UNAVAILABLE','Não foi possível verificar a abrangência da consulta.');
  }
  return parsed.data;
}
