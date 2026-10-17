import { pickWorkerFields } from './privacy.ts';
import { WorkerToolError, type WorkerAccessContext } from './types.ts';

/** Positive allowlist. Never accept relation/column/RPC names from model input. */
export const READ_TABLES = {
  cronograma_eventos_full: { scope: 'org', fields: ['id','title','status','priority','category','start_date','end_date','start_time','end_time','location','commission_name'] },
  cronograma_subeventos: { scope: 'org', fields: ['id','parent_event_id','title','status','priority','start_date','end_date','start_time','end_time','sort_order'] },
  venue_events: { scope: 'org', fields: ['id','title','status','event_type','start_at','end_at','setup_start_at','teardown_end_at','pending_date','estimated_audience','confirmed_audience','approval_status','conflict_status','contract_status'] },
  venue_spaces: { scope: 'org', fields: ['id','name','slug','active'] },
  venue_occupancies: { scope: 'org', fields: ['id','event_id','event_space_id','active','setup_start_at','teardown_end_at'] },
  venue_counterpart_balances: { scope: 'org', fields: ['id','space_id','unit_type','granted_quantity','reserved_quantity','consumed_quantity','remaining_quantity','pending_quantity','projected_excess_quantity','confirmed_excess_quantity'] },
  map_projects: { scope: 'org', fields: ['id','name','is_archived'] },
  map_segments: { scope: 'project', fields: ['id','project_id','slug','name','display_name','is_active','required_capability'] },
  map_entities: { scope: 'project', fields: ['id','project_id','public_identifier','name','parent_entity_id','segment_id','classification'] },
  commercial_lots: { scope: 'project', fields: ['id','project_id','entity_id','public_identifier','display_name','lot_number','block','official_area_sqm','status'] },
  commercial_lot_pricing_2028: { scope: 'project', fields: ['lot_id','project_id','entity_id','public_identifier','pavilion','block','lot_num','official_area_sqm','status','renovacao_total','segunda_total','resolution_status'] },
  lot_sale_orders: { scope: 'project', fields: ['id','project_id','status'] },
  commissions: { scope: 'org', fields: ['id','nome','slug','unit_type','is_active'] },
  commission_responsibles: { scope: 'org', fields: ['id','commission_id','display_name','relationship_role','is_primary'] },
  agenda_meeting_action_items: { scope: 'org', fields: ['id','event_id','session_id','title','due_date','status','confirmed_at'] },
  agenda_meeting_sessions: { scope: 'org', fields: ['id','event_id','started_at','ended_at','processing_state','consent_confirmed'] },
  transports: { scope: 'org', fields: ['id','titulo','status','tipo','inicio_em','fim_em','passageiros_qtd','prioridade'] },
  vehicles: { scope: 'org', fields: ['id','categoria','marca','modelo','status','km_atual','cycle_year'] },
  cart_reservations: { scope: 'org', fields: ['id','cart_id','inicio_em','fim_em','status','comissao','cycle_year'] },
  scooter_reservations: { scope: 'org', fields: ['id','scooter_id','inicio_em','fim_em','status','comissao','cycle_year'] },
  schedules: { scope: 'org', fields: ['id','nome','data_inicio','data_fim','status','cycle_year'] },
  transport_weather_snapshots: { scope: 'org', fields: ['id','transport_id','city_name','current_condition_label','temperature_c','precipitation_probability_pct','wind_speed_kph','operational_risk_level','fetched_at','valid_until'] },
  financial_editions: { scope: 'org', fields: ['id','code','label','status','period_start','period_end'] },
} as const;
export type ReadTable = keyof typeof READ_TABLES;
export const READ_RPCS = [
  'financial_can','venue_get_permissions','map_has_explicit_capability','map_can_access_segment',
  'cronograma_unit_agenda','cronograma_unit_metrics','cronograma_restaurant_alert','venue_check_availability',
  'get_commission_map_segment_inventory','list_commercial_sale_orders','get_commercial_sale_order_detail',
  'financial_edition_summary','financial_budget_execution','financial_expense_comparison',
  'workers_interest_summary','workers_public_links_overview',
  'workers_map_sales_overview','workers_agenda_personal_summary','workers_agenda_people_ranking',
  'workers_agenda_query','workers_map_inventory_summary',
] as const;
export type ReadRpc = typeof READ_RPCS[number];

type Filter = readonly [column: string, operation: 'eq' | 'gte' | 'lte' | 'ilike' | 'in' | 'is', value: unknown];
export interface ReadOptions {
  projectId?: string;
  filters?: readonly Filter[];
  order?: string;
  limit?: number;
}
export async function requireProject(ctx: WorkerAccessContext, id: string) {
  const { data, error } = await ctx.supabase.from('map_projects').select('id,org_id,is_archived')
    .eq('org_id', ctx.orgId).eq('id', id).eq('is_archived', false).maybeSingle();
  if (error || !data || data.org_id !== ctx.orgId) throw new WorkerToolError('NOT_FOUND', 'Projeto não encontrado ou sem acesso.');
}
export async function readRows(ctx: WorkerAccessContext, table: ReadTable, options: ReadOptions = {}) {
  if (!Object.prototype.hasOwnProperty.call(READ_TABLES, table)) throw new WorkerToolError('TOOL_NOT_ALLOWED', 'Fonte de leitura não permitida.');
  const spec = READ_TABLES[table];
  const size = Math.max(1, Math.min(options.limit ?? 20, 100));
  if (spec.scope === 'project') {
    if (!options.projectId) throw new WorkerToolError('INVALID_INPUT', 'Informe o projeto.');
    await requireProject(ctx, options.projectId);
  }
  let query = ctx.supabase.from(table).select(spec.fields.join(','), { count: 'exact' });
  if (spec.scope === 'org') query = query.eq('org_id', ctx.orgId);
  else {
    query = query.eq('project_id', options.projectId);
  }
  for (const [column, operation, value] of options.filters ?? []) {
    if (operation === 'eq') query = query.eq(column, value);
    if (operation === 'gte') query = query.gte(column, value);
    if (operation === 'lte') query = query.lte(column, value);
    if (operation === 'ilike') query = query.ilike(column, String(value));
    if (operation === 'in') query = query.in(column, value as string[]);
    if (operation === 'is') query = query.is(column, value as null);
  }
  if (options.order) query = query.order(options.order, { ascending: true });
  const { data, error, count } = await query.limit(size + 1);
  if (error) throw new WorkerToolError('DATA_UNAVAILABLE', 'Não foi possível consultar os dados autorizados.');
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return { records: rows.slice(0, size).map((row) => pickWorkerFields(row, spec.fields)), total: count ?? rows.length, truncated: count != null ? count > size : rows.length > size };
}

export async function readRpc(ctx: WorkerAccessContext, rpc: ReadRpc, args: Record<string, unknown>): Promise<unknown> {
  if (!(READ_RPCS as readonly string[]).includes(rpc)) throw new WorkerToolError('TOOL_NOT_ALLOWED', 'RPC fora da allowlist de leitura.');
  if ('_org_id' in args && args._org_id !== ctx.orgId) throw new WorkerToolError('PERMISSION_DENIED', 'Organização inválida.');
  const { data, error } = await ctx.supabase.rpc(rpc, args);
  if (error) throw new WorkerToolError('DATA_UNAVAILABLE', 'Não foi possível consultar os dados autorizados.');
  return data;
}
