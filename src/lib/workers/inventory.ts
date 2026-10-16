import { READ_RPCS, READ_TABLES } from './sources.ts';

/** Reviewable Phase 0 inventory; none of these entries supplies an executable handler. */
export const workerReadSourceInventory = Object.freeze({ tables: Object.freeze(READ_TABLES), rpcs: Object.freeze(READ_RPCS) });
export const futureWorkerWriteInventory = Object.freeze([
  { worker:'agenda', rpc:'cronograma_save_event', capability:'cronograma_eventos_write', enabled:false },
  { worker:'agenda', rpc:'cronograma_save_subevent', capability:'cronograma_eventos_write', enabled:false },
  { worker:'agenda', rpc:'cronograma_save_subevent_plan', capability:'cronograma_eventos_write', enabled:false },
  { worker:'arena', rpc:'venue_save_event_note', capability:'venue_events_manage', enabled:false },
  { worker:'arena', rpc:'venue_update_checklist_item', capability:'venue_operations_manage', enabled:false },
  { worker:'arena', rpc:'venue_save_event', capability:'venue_events_manage', enabled:false },
  { worker:'mapa', rpc:'start_commercial_negotiation', capability:'map.manage_sales', enabled:false },
  { worker:'mapa', rpc:'reserve_commercial_lot', capability:'map.manage_sales', enabled:false },
  { worker:'comissao', rpc:null, capability:null, enabled:false, reason:'Não há RPC segura de criação de tarefa; useTasks faz INSERT direto.' },
] as const);
export const prohibitedWorkerOperations = Object.freeze([
  'cronograma_delete_event','cronograma_delete_subevent','venue_delete_event',
  'financial_record_movement','financial_reverse_movement','financial_transition_expense',
  'confirm_sale_order_items','cancel_sale_order_items','revise_sale_order_items','register_commercial_sale_order',
  'public_map_link_rotate','public_map_link_set_active','public_map_track','publish_commercial_map',
  'save_map_geometry','set_lot_price_override','apply_lot_price_rules_2028',
  'transport-lifecycle','weather-service','send-push-notification','send-transactional-email',
  'sql','insert','update','delete','create_user','update_capabilities',
] as const);
