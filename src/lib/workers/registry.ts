import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeWorkerPolicy, resolveWorkerAccess } from './access.ts';
import { workerToolDefinitions } from './catalog.ts';
import { pickWorkerFields, sanitizeWorkerData } from './privacy.ts';
import { READ_RPCS, READ_TABLES, readRows, readRpc, requireProject } from './sources.ts';
import { WorkerToolError, type AccessPolicy, type ToolResult, type WorkerAccessContext, type WorkerId, type WorkerToolDefinition } from './types.ts';

const ACCESS_SOURCES = ['agenda_meeting_sessions','cronograma_evento_comissoes','org_members','user_capabilities','commission_responsibles'];
const allowedSources = new Set([...Object.keys(READ_TABLES), ...READ_RPCS, ...ACCESS_SOURCES]);
const definitions = new Map(workerToolDefinitions.map((tool) => [tool.name, tool]));

/** No registration API accepts handlers. Only closed, reviewed definitions are runnable. */
export function assertReadToolRegistrable(candidate: Pick<WorkerToolDefinition, 'name' | 'sources' | 'readOnly' | 'requiresConfirmation'>): void {
  const known = definitions.get(candidate.name);
  if (!known || candidate.readOnly !== true || candidate.requiresConfirmation !== false || candidate.sources.some((source) => !allowedSources.has(source))
    || candidate.sources.length !== known.sources.length || candidate.sources.some((source, index) => source !== known.sources[index])) {
    throw new WorkerToolError('TOOL_NOT_ALLOWED', 'Ferramenta fora do catálogo fechado de leitura.');
  }
}
for (const definition of workerToolDefinitions) assertReadToolRegistrable(definition);

export async function listWorkerTools(workerId: WorkerId, context: WorkerAccessContext): Promise<WorkerToolDefinition[]> {
  const ctx = await resolveWorkerAccess(context.supabase, context.userId, context.orgId);
  const permissions = new Map<AccessPolicy, boolean>();
  const result: WorkerToolDefinition[] = [];
  for (const definition of workerToolDefinitions.filter((item) => item.worker === workerId)) {
    const policy = definition.capability.policy;
    if (!permissions.has(policy)) permissions.set(policy, await authorizeWorkerPolicy(policy, ctx));
    if (permissions.get(policy)) result.push(definition);
  }
  return result;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function output(definition: WorkerToolDefinition, records: Record<string, unknown>[], options: {total?: number; truncated?: boolean; link?: string; summary?: string} = {}): ToolResult {
  const safe = sanitizeWorkerData(records) as Record<string, unknown>[];
  return {
    summary: options.summary ?? (safe.length ? `${safe.length} registro(s) autorizado(s) retornado(s).${options.truncated ? ' Resultado parcial; consulte a tela para a lista completa.' : ''}` : 'Não há dados visíveis para esta consulta.'),
    records: safe,
    citations: [{ label: definition.title, url: options.link ?? definition.deepLink, source: 'app' }],
    total: options.total ?? safe.length, truncated: options.truncated ?? false,
  };
}
async function requireCommission(ctx: WorkerAccessContext, id: string, ownOnly = false): Promise<void> {
  const { data, error } = await ctx.supabase.from('commissions').select('id,org_id')
    .eq('org_id', ctx.orgId).eq('id', id).eq('is_active', true).maybeSingle();
  if (error || !data || data.org_id !== ctx.orgId) throw new WorkerToolError('NOT_FOUND', 'Comissão não encontrada ou sem acesso.');
  if (ownOnly && ctx.role !== 'admin' && !(await ownCommissionIds(ctx)).includes(id)) throw new WorkerToolError('PERMISSION_DENIED', 'Comissão fora do seu vínculo.');
}
async function ownCommissionIds(ctx: WorkerAccessContext): Promise<string[]> {
  const [memberResult, responsibleResult] = await Promise.all([
    ctx.supabase.from('org_members').select('commission_id').eq('org_id', ctx.orgId).eq('user_id', ctx.userId).eq('is_active', true).maybeSingle(),
    ctx.supabase.from('commission_responsibles').select('commission_id').eq('org_id', ctx.orgId).eq('user_id', ctx.userId).eq('active', true).limit(100),
  ]);
  if (memberResult.error || responsibleResult.error) throw new WorkerToolError('PERMISSION_DENIED', 'Não foi possível validar o vínculo da comissão.');
  return [...new Set([memberResult.data?.commission_id, ...(responsibleResult.data ?? []).map((row) => row.commission_id)].filter((id): id is string => typeof id === 'string'))];
}
async function requireEvent(ctx: WorkerAccessContext, id: string): Promise<Record<string, unknown>> {
  const result = await readRows(ctx, 'cronograma_eventos_full', { filters: [['id','eq',id]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError('NOT_FOUND', 'Evento não encontrado ou sem acesso.');
  return result.records[0];
}
async function requireEdition(ctx: WorkerAccessContext, id: string) {
  const result = await readRows(ctx, 'financial_editions', { filters: [['id','eq',id]], limit: 1 });
  if (!result.records.length) throw new WorkerToolError('NOT_FOUND', 'Edição não encontrada ou sem acesso.');
}
const moneyFields = ['count','cap_cents','uncapped_count','planned_cents','line_count','committed_cents','projected_cents','confirmed_cents','declared_cents','in_kind_cents','paid_cents','payable_open_cents','overdue_count','received_cents','receivable_open_cents','inconsistent_count','inflow_cents','outflow_cents','expense_planned_cents','open_cents','deviation_cents','deviation_pct','comparison_state','overdue_cents','realized_without_plan_count'];

async function dispatch(def: WorkerToolDefinition, input: Record<string, unknown>, ctx: WorkerAccessContext): Promise<ToolResult> {
  const size = Number(input.limit ?? 20);
  const text = (key: string) => String(input[key]);
  switch (def.name) {
    case 'list_events': {
      const result = await readRows(ctx,'cronograma_eventos_full',{ limit: size, order:'start_date', filters: [
        ...(input.from_date ? [['start_date','gte',input.from_date] as const] : []),
        ...(input.to_date ? [['start_date','lte',input.to_date] as const] : []),
        ...(input.status ? [['status','eq',input.status] as const] : []),
        ...(input.search ? [['title','ilike',`%${String(input.search).replace(/[%_\\]/g,'')}%`] as const] : []),
      ] });
      return output(def,result.records,result);
    }
    case 'get_event': return output(def,[await requireEvent(ctx,text('event_id'))],{link:`/cronograma-eventos?event=${encodeURIComponent(text('event_id'))}`});
    case 'list_subevents': {
      await requireEvent(ctx,text('event_id'));
      const result = await readRows(ctx,'cronograma_subeventos',{limit:size,order:'sort_order',filters:[['parent_event_id','eq',input.event_id]]});
      return output(def,result.records,result);
    }
    case 'commission_agenda':
    case 'commission_metrics': {
      await requireCommission(ctx,text('commission_id'));
      const rpc = def.name === 'commission_agenda' ? 'cronograma_unit_agenda' : 'cronograma_unit_metrics';
      const result = rows(await readRpc(ctx,rpc,{_commission_id:input.commission_id}));
      const fields = def.name === 'commission_agenda' ? READ_TABLES.cronograma_eventos_full.fields : ['completed','documents','in_month','total','upcoming'];
      return output(def,result.slice(0,size).map((row) => pickWorkerFields(row,fields)),{total:result.length,truncated:result.length>size});
    }
    case 'list_venue_events': {
      const result = await readRows(ctx,'venue_events',{limit:size,order:'start_at',filters:[
        ...(input.from_datetime ? [['start_at','gte',input.from_datetime] as const] : []),
        ...(input.to_datetime ? [['start_at','lte',input.to_datetime] as const] : []),
      ]});
      return output(def,result.records,result);
    }
    case 'venue_availability': {
      if (text('teardown_end_at') <= text('setup_start_at')) throw new WorkerToolError('INVALID_INPUT','O fim precisa ocorrer após o início.');
      const ids = input.space_ids as string[];
      const spaces = await readRows(ctx,'venue_spaces',{limit:100,filters:[['id','in',ids],['active','eq',true]]});
      if (new Set(spaces.records.map((space) => space.id)).size !== new Set(ids).size) throw new WorkerToolError('NOT_FOUND','Espaço não encontrado ou fora da organização.');
      const result = rows(await readRpc(ctx,'venue_check_availability',{_org_id:ctx.orgId,_space_ids:ids,_setup_start_at:input.setup_start_at,_teardown_end_at:input.teardown_end_at}));
      return output(def,result.slice(0,100).map((row) => pickWorkerFields(row,['conflict_kind','space_id','starts_at','ends_at','title'])),{truncated:result.length>100});
    }
    case 'venue_occupancy': {
      const result = await readRows(ctx,'venue_occupancies',{limit:size,order:'setup_start_at',filters:[['active','eq',true]]});
      return output(def,result.records,result);
    }
    case 'venue_counterparts': {
      const result = await readRows(ctx,'venue_counterpart_balances',{limit:size});
      return output(def,result.records,result);
    }
    case 'restaurant_alert': {
      const result = rows(await readRpc(ctx,'cronograma_restaurant_alert',{_org_id:ctx.orgId,_start_date:input.from_date,_end_date:input.to_date}));
      return output(def,result.slice(0,100).map((row) => pickWorkerFields(row,['title','event_date','event_end_date','start_time','end_time'])),{truncated:result.length>100});
    }
    case 'map_projects': {
      const result = await readRows(ctx,'map_projects',{limit:size,filters:[['is_archived','eq',false]]});
      return output(def,result.records,result);
    }
    case 'map_segments':
    case 'map_entities':
    case 'map_inventory':
    case 'map_prices': {
      const table = def.name === 'map_segments' ? 'map_segments' : def.name === 'map_entities' ? 'map_entities' : def.name === 'map_prices' ? 'commercial_lot_pricing_2028' : 'commercial_lots';
      const result = await readRows(ctx,table,{projectId:text('project_id'),limit:size,filters:[
        ...(def.name==='map_segments' ? [['is_active','eq',true] as const] : []),
        ...(def.name==='map_inventory' ? [['archived_at','is',null] as const] : []),
        ...(def.name==='map_entities' ? [['is_archived','eq',false] as const] : []),
        ...(input.segment_id ? [['segment_id','eq',input.segment_id] as const] : []),
        ...(input.status ? [['status','eq',input.status] as const] : []),
        ...(input.pavilion ? [['pavilion','eq',input.pavilion] as const] : []),
      ]});
      return output(def,result.records,result);
    }
    case 'map_segment_inventory': {
      const segment = await readRows(ctx,'map_segments',{projectId:text('project_id'),limit:1,filters:[['id','eq',input.segment_id],['is_active','eq',true]]});
      if (!segment.records.length) throw new WorkerToolError('NOT_FOUND','Segmento fora do projeto autorizado.');
      const result = rows(await readRpc(ctx,'get_commission_map_segment_inventory',{p_segment_id:input.segment_id}));
      return output(def,result.map((row) => pickWorkerFields(row,['expected_entity_count','expected_lot_count','lineage_delta'])));
    }
    case 'list_sale_orders': {
      await requireProject(ctx,text('project_id'));
      if (input.has_document !== undefined && !(await authorizeWorkerPolicy('map_contracts',ctx))) throw new WorkerToolError('PERMISSION_DENIED','Consulta de contratos requer permissão de contratos.');
      const response = object(await readRpc(ctx,'list_commercial_sale_orders',{p_project_id:input.project_id,p_limit:size,...(input.status ? {p_status:input.status}:{}),...(input.has_document !== undefined ? {p_has_document:input.has_document}:{})}));
      const result = rows(response.rows).map((row) => pickWorkerFields(row,['record_id','kind','order_id','sale_id','reference','created_at','status','item_count','active_count','signed_count','pending_count','cancelled_count','legacy_count','lot_ids']));
      return output(def,result,{total:Number(response.total ?? result.length),truncated:Number(response.total ?? 0)>size});
    }
    case 'sale_order_detail':
    case 'sale_order_contract_summary': {
      const order = await readRows(ctx,'lot_sale_orders',{projectId:text('project_id'),limit:1,filters:[['id','eq',input.order_id]]});
      if (!order.records.length) throw new WorkerToolError('NOT_FOUND','Pedido fora do projeto autorizado.');
      const response = object(await readRpc(ctx,'get_commercial_sale_order_detail',{p_order_id:input.order_id}));
      const header = object(response.header);
      if (header.projectId !== input.project_id || header.orderId !== input.order_id) throw new WorkerToolError('PERMISSION_DENIED','Pedido fora do projeto autorizado.');
      if (def.name === 'sale_order_contract_summary') {
        if (response.documentsAccessible !== true) throw new WorkerToolError('PERMISSION_DENIED','Contratos sem permissão de leitura.');
        const contracts = rows(response.contracts);
        return output(def,contracts.slice(0,100).map((row) => pickWorkerFields(row,['contractId','scope','lotIds'])),{total:contracts.length,truncated:contracts.length>100});
      }
      const result = rows(response.items).slice(0,100).map((item) => pickWorkerFields(item,['itemId','lotId','entityId','publicIdentifier','lotNumber','displayName','areaSnapshot','contractState','lotStatus']));
      return output(def,result,{truncated:rows(response.items).length>100});
    }
    case 'interest_summary': {
      const response = object(await readRpc(ctx,'workers_interest_summary',{_org_id:ctx.orgId,...(input.from_datetime ? {_from:input.from_datetime}:{}),...(input.to_datetime ? {_to:input.to_datetime}:{})}));
      return output(def,rows(response.areas).slice(0,50).map((row) => pickWorkerFields(row,['id','slug','displayName','scopeKind','visits','sessions','lotSelections','detailViews'])),{truncated:rows(response.areas).length>=50});
    }
    case 'public_links_overview': {
      const result = rows(await readRpc(ctx,'workers_public_links_overview',{_org_id:ctx.orgId}));
      return output(def,result.slice(0,100).map((row) => pickWorkerFields(row,['id','slug','displayName','scopeKind','isActive','sortOrder'])),{truncated:result.length>=100});
    }
    case 'my_commissions': {
      const ids = ctx.role === 'admin' ? null : await ownCommissionIds(ctx);
      if (ids && !ids.length) return output(def,[]);
      const result = await readRows(ctx,'commissions',{limit:size,filters:[['is_active','eq',true],...(ids ? [['id','in',ids] as const] : [])]});
      return output(def,result.records,result);
    }
    case 'commission_responsibles': {
      await requireCommission(ctx,text('commission_id'),true);
      const result = await readRows(ctx,'commission_responsibles',{limit:size,filters:[['commission_id','eq',input.commission_id],['active','eq',true]]});
      return output(def,result.records,result);
    }
    case 'meeting_sessions':
    case 'meeting_actions': {
      await requireCommission(ctx,text('commission_id'),true);
      await requireEvent(ctx,text('event_id'));
      const {data:link,error:linkError}=await ctx.supabase.from('cronograma_evento_comissoes').select('event_id').eq('org_id',ctx.orgId).eq('event_id',input.event_id).eq('commission_id',input.commission_id).limit(1).maybeSingle();
      if(linkError||!link) throw new WorkerToolError('NOT_FOUND','Evento não vinculado à comissão.');
      if (def.name === 'meeting_sessions') {
        const result = await readRows(ctx,'agenda_meeting_sessions',{limit:size,order:'started_at',filters:[['event_id','eq',input.event_id],['consent_confirmed','eq',true],['deleted_at','is',null]]});
        return output(def,result.records,{...result,link:`/cronograma-eventos?event=${encodeURIComponent(text('event_id'))}`});
      }
      const {data:session,error}=await ctx.supabase.from('agenda_meeting_sessions').select('id,consent_confirmed').eq('org_id',ctx.orgId).eq('event_id',input.event_id).eq('id',input.session_id).eq('consent_confirmed',true).is('deleted_at',null).maybeSingle();
      if(error||!session?.consent_confirmed) throw new WorkerToolError('PERMISSION_DENIED','Sessão sem acesso ou consentimento confirmado.');
      const result=await readRows(ctx,'agenda_meeting_action_items',{limit:size,filters:[['session_id','eq',input.session_id],['event_id','eq',input.event_id]]});
      return output(def,result.records,{...result,link:`/cronograma-eventos?event=${encodeURIComponent(text('event_id'))}`});
    }
    case 'list_transports': {
      const result = await readRows(ctx,'transports',{limit:size,order:'inicio_em',filters:[
        ...(input.status ? [['status','eq',input.status] as const] : []),
        ...(input.from_datetime ? [['inicio_em','gte',input.from_datetime] as const] : []),
        ...(input.to_datetime ? [['inicio_em','lte',input.to_datetime] as const] : []),
      ]});
      return output(def,result.records,result);
    }
    case 'vehicle_summary':
    case 'cart_reservations':
    case 'scooter_reservations':
    case 'logistics_schedules':
    case 'transport_weather':
    case 'financial_editions': {
      const table = def.name==='vehicle_summary' ? 'vehicles' : def.name==='logistics_schedules' ? 'schedules' : def.name==='transport_weather' ? 'transport_weather_snapshots' : def.name;
      const result=await readRows(ctx,table,{limit:size,filters:def.name==='transport_weather' ? [['is_latest','eq',true]]:[]});
      return output(def,result.records,result);
    }
    case 'financial_edition_summary':
    case 'financial_budget_execution':
    case 'financial_expense_comparison': {
      await requireEdition(ctx,text('edition_id'));
      const response=object(await readRpc(ctx,def.name,{_org_id:ctx.orgId,_edition_id:input.edition_id}));
      if(def.name==='financial_edition_summary') {
        const result: Record<string,unknown>={};
        for(const group of ['budget','revenue','sponsorship','expenses','revenues','obligations','movements']) result[group]=pickWorkerFields(response[group],moneyFields);
        return output(def,[result]);
      }
      if(def.name==='financial_budget_execution') {
        return output(def,[{budgets:rows(response.budgets).slice(0,100).map((row)=>pickWorkerFields(row,['budget_id',...moneyFields])),lines:rows(response.lines).slice(0,100).map((row)=>pickWorkerFields(row,['line_id',...moneyFields]))}],{truncated:rows(response.budgets).length>100||rows(response.lines).length>100});
      }
      return output(def,[{totals:pickWorkerFields(response.totals,moneyFields),by_category:rows(response.by_category).slice(0,100).map((row)=>pickWorkerFields(row,['id','name',...moneyFields])),by_commission:rows(response.by_commission).slice(0,100).map((row)=>pickWorkerFields(row,['id','name',...moneyFields]))}],{truncated:rows(response.by_category).length>100||rows(response.by_commission).length>100});
    }
    default: throw new WorkerToolError('TOOL_NOT_ALLOWED','Ferramenta não disponível nesta fase.');
  }
}

export async function executeWorkerTool(name: string, input: unknown, context: WorkerAccessContext): Promise<ToolResult> {
  const definition=definitions.get(name);
  if(!definition) throw new WorkerToolError('TOOL_NOT_ALLOWED','Ferramenta não permitida.');
  assertReadToolRegistrable(definition);
  // Never trust the caller's role/capabilities snapshot; grants can be revoked mid-chat.
  const ctx=await resolveWorkerAccess(context.supabase,context.userId,context.orgId);
  if(!(await authorizeWorkerPolicy(definition.capability.policy,ctx))) throw new WorkerToolError('PERMISSION_DENIED','Você não tem acesso a esta consulta.');
  const parsed=definition.inputSchema.safeParse(input);
  if(!parsed.success) throw new WorkerToolError('INVALID_INPUT','Parâmetros inválidos para esta consulta.');
  return dispatch(definition,parsed.data,ctx);
}

/** MCP has no current-org field. Ambiguous organizations must never be guessed. */
export async function executeMcpReadTool(client: SupabaseClient, userId: string, name: 'list_events'|'get_event'|'list_transports', input: unknown): Promise<ToolResult> {
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||auth?.user?.id!==userId) throw new WorkerToolError('AUTH_REQUIRED','Sessão de usuário necessária.');
  const {data,error}=await client.from('org_members').select('org_id').eq('user_id',userId).eq('is_active',true).limit(2);
  if(error||data?.length!==1) throw new WorkerToolError('PERMISSION_DENIED','A consulta MCP exige um único vínculo organizacional ativo. Use a equipe no app para escolher a organização.');
  const ctx=await resolveWorkerAccess(client,userId,data[0].org_id);
  return executeWorkerTool(name,input,ctx);
}
