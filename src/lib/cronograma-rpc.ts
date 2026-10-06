import { supabase } from '@/integrations/supabase/client';

export type CronogramaRpcErrorCode =
  | 'CRONOGRAMA_NOT_FOUND'
  | 'CRONOGRAMA_PERMISSION_DENIED'
  | 'CRONOGRAMA_VALIDATION_ERROR'
  | 'CRONOGRAMA_CONFLICT'
  | 'CRONOGRAMA_RELATIONSHIP_INVALID'
  | 'CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED'
  | 'CRONOGRAMA_RESTAURANT_FORWARDING_DISABLED'
  | 'CRONOGRAMA_RESTAURANT_PROTECTED'
  | 'CRONOGRAMA_RESTAURANT_CREATOR_INVALID'
  | 'CRONOGRAMA_RESTAURANT_DESTINATION_INVALID'
  | 'CRONOGRAMA_RESTAURANT_REACTIVATION_REQUIRED'
  | 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_CHANGED'
  | 'CRONOGRAMA_RESTAURANT_RESPONSIBLE_INVALID'
  | 'CRONOGRAMA_RESTAURANT_SOURCE_IDENTITY_IMMUTABLE'
  | 'CRONOGRAMA_RESTAURANT_SOURCE_PERMISSION_DENIED'
  | 'CRONOGRAMA_RESTAURANT_TITLE_INVALID'
  | 'CRONOGRAMA_RESTAURANT_USE_VERSIONED_SAVE'
  | 'CRONOGRAMA_IDEMPOTENCY_KEY_REUSED'
  | 'CRONOGRAMA_DELETED_SOURCE'
  | 'CRONOGRAMA_ORIGIN_IMMUTABLE'
  | 'CRONOGRAMA_CREATOR_IMMUTABLE'
  | 'CRONOGRAMA_CREATOR_INVALID'
  | 'CRONOGRAMA_UNKNOWN';

export class CronogramaRpcError extends Error {
  code: CronogramaRpcErrorCode;
  details?: string;
  constructor(code: CronogramaRpcErrorCode, message: string, details?: string) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const codeMessages: Record<CronogramaRpcErrorCode, string> = {
  CRONOGRAMA_NOT_FOUND: 'Registro do cronograma não encontrado.',
  CRONOGRAMA_PERMISSION_DENIED: 'Você não tem permissão para esta operação.',
  CRONOGRAMA_VALIDATION_ERROR: 'Dados inválidos para salvar.',
  CRONOGRAMA_CONFLICT:
    'Este item foi atualizado por outro usuário. Recarregue e revise a versão mais recente.',
  CRONOGRAMA_RELATIONSHIP_INVALID: 'Vínculo inválido (comissão ou responsável).',
  CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED: 'O responsável pela validação no Restaurante ainda precisa ser configurado. Os campos foram preservados; solicite essa configuração e tente novamente.',
  CRONOGRAMA_RESTAURANT_FORWARDING_DISABLED: 'O encaminhamento ao Restaurante ainda não está habilitado nesta organização. Os campos foram preservados para uma nova tentativa após a configuração.',
  CRONOGRAMA_RESTAURANT_PROTECTED: 'O pedido no Restaurante já possui uma operação protegida. Solicite a revisão no Restaurante antes de alterar o período, retirar o local, cancelar ou excluir este evento.',
  CRONOGRAMA_RESTAURANT_CREATOR_INVALID: 'Não foi possível verificar a autoria original deste evento. Solicite a revisão do vínculo do criador com a organização antes de encaminhá-lo.',
  CRONOGRAMA_RESTAURANT_DESTINATION_INVALID: 'O espaço Restaurante Fenasoja precisa de uma configuração ativa e única nesta organização. Solicite essa configuração e tente novamente.',
  CRONOGRAMA_RESTAURANT_REACTIVATION_REQUIRED: 'Este evento já possui um pedido cancelado no Restaurante. Solicite a revisão desse pedido antes de voltar a encaminhá-lo.',
  CRONOGRAMA_RESTAURANT_RESPONSIBLE_CHANGED: 'O responsável configurado mudou. Solicite a revisão auditada do responsável do pedido no Restaurante antes de continuar.',
  CRONOGRAMA_RESTAURANT_RESPONSIBLE_INVALID: 'O responsável pela validação precisa de um vínculo ativo e das permissões de aprovação na organização. Solicite a revisão da configuração.',
  CRONOGRAMA_RESTAURANT_SOURCE_IDENTITY_IMMUTABLE: 'A identidade e a autoria do evento original precisam ser preservadas. Recarregue o evento antes de tentar novamente.',
  CRONOGRAMA_RESTAURANT_SOURCE_PERMISSION_DENIED: 'Você não tem permissão para encaminhar ou alterar este evento da Agenda Fenasoja.',
  CRONOGRAMA_RESTAURANT_TITLE_INVALID: 'O pedido no Restaurante exige um título com pelo menos 3 caracteres. Complete o título e tente novamente.',
  CRONOGRAMA_RESTAURANT_USE_VERSIONED_SAVE: 'Este evento vinculado precisa ser alterado pela Agenda Fenasoja com sua versão atual. Recarregue o evento e tente novamente.',
  CRONOGRAMA_IDEMPOTENCY_KEY_REUSED: 'Esta tentativa contém dados diferentes da submissão anterior. Revise os campos e envie novamente.',
  CRONOGRAMA_DELETED_SOURCE: 'Este evento foi excluído. Recarregue a agenda antes de continuar; uma nova tentativa não pode restaurar o registro excluído.',
  CRONOGRAMA_ORIGIN_IMMUTABLE: 'A frente de origem deste evento precisa ser preservada. Recarregue o evento antes de tentar novamente.',
  CRONOGRAMA_CREATOR_IMMUTABLE: 'A autoria original deste evento precisa ser preservada. Recarregue o evento antes de tentar novamente.',
  CRONOGRAMA_CREATOR_INVALID: 'Não foi possível verificar o criador deste evento na organização. Solicite a revisão do vínculo antes de salvar.',
  CRONOGRAMA_UNKNOWN: 'Não foi possível confirmar o salvamento. Seus campos foram preservados. Tente novamente para conferir a mesma submissão com segurança.',
};

function normalize(err: unknown): CronogramaRpcError {
  const raw = (err as { message?: string })?.message ?? String(err);
  const match = /^(CRONOGRAMA_[A-Z_]+)\s*:\s*(.*)$/i.exec(raw);
  if (match) {
    const code = match[1].toUpperCase() as CronogramaRpcErrorCode;
    const known = codeMessages[code] ?? codeMessages.CRONOGRAMA_UNKNOWN;
    return new CronogramaRpcError(code, known, match[2]);
  }
  return new CronogramaRpcError('CRONOGRAMA_UNKNOWN', codeMessages.CRONOGRAMA_UNKNOWN, raw);
}

export interface CronogramaCommissionLinkInput {
  commission_id?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
  relation_role?: 'principal' | 'participante';
}

export interface CronogramaResponsibleLinkInput {
  user_id?: string | null;
  name?: string | null;
  role?: string | null;
  is_primary?: boolean;
  responsible_type?: 'member' | 'external';
}

export interface CronogramaSaveEventPayload {
  id?: string;
  org_id: string;
  source_key?: string;
  origin_commission_id?: string | null;
  title: string;
  description?: string | null;
  category?: string;
  category_key?: string | null;
  event_type?: string;
  source_year?: 2026 | 2027 | 2028;
  start_date?: string | null;
  end_date?: string | null;
  month_label?: string | null;
  week_label?: string | null;
  status?: string;
  priority?: string;
  location?: string | null;
  location_code?: string | null;
  event_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
  responsible_name?: string | null;
  has_exact_date?: boolean;
  notify_all_commission_members?: boolean;
  is_official_seed?: boolean;
  pending_reason?: string | null;
  decision_needed?: string | null;
  commissions?: CronogramaCommissionLinkInput[];
  responsibles?: CronogramaResponsibleLinkInput[];
  request_id?: string;
}

export interface CronogramaSaveSubeventPayload {
  id?: string;
  parent_event_id: string;
  title: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  priority?: string;
  commission_slug?: string | null;
  responsible_name?: string | null;
  sort_order?: number;
  commissions?: CronogramaCommissionLinkInput[];
  responsibles?: CronogramaResponsibleLinkInput[];
  request_id?: string;
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new CronogramaRpcError('CRONOGRAMA_UNKNOWN', 'Este navegador precisa oferecer identificadores seguros para salvar. Atualize-o e tente novamente.');
}

export interface CronogramaRestaurantForwarding {
  event_id: string;
  status: string;
  approval_status: string;
  source_revision: number;
  action?: 'created' | 'updated' | 'cancelled' | 'unchanged' | 'create' | 'update' | 'detached';
}

export function cronogramaSaveSuccessMessage(
  event: { restaurantForwarding?: CronogramaRestaurantForwarding | null },
  fallback = 'Evento salvo.',
): string {
  const forwarding = event.restaurantForwarding;
  if (!forwarding) return fallback;
  if (forwarding.status === 'cancelado' || forwarding.action === 'cancelled') {
    return 'Evento salvo. O pedido vinculado no Restaurante foi cancelado.';
  }
  if (forwarding.approval_status === 'pendente') {
    return forwarding.action === 'created' || forwarding.action === 'create'
      ? 'Evento salvo e encaminhado ao Restaurante, aguardando validação.'
      : 'Evento salvo. O pedido existente no Restaurante foi atualizado e aguarda validação.';
  }
  return 'Evento salvo. O pedido vinculado no Restaurante foi atualizado.';
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/** Retains the submission identity across an uncertain response and duplicate clicks. */
export function createCronogramaRequestRegistry() {
  const requests = new Map<string, { fingerprint: string; requestId: string }>();
  return (payload: CronogramaSaveEventPayload, version?: number | null): CronogramaSaveEventPayload => {
    if (payload.request_id) return payload;
    const identity = payload.id ?? payload.source_key;
    if (!identity) return { ...payload, request_id: newRequestId() };
    const key = `${payload.org_id}:${identity}`;
    const fingerprint = JSON.stringify(canonicalValue({ payload, version: version ?? null }));
    let request = requests.get(key);
    if (request?.fingerprint !== fingerprint) {
      request = { fingerprint, requestId: newRequestId() };
      requests.set(key, request);
    }
    return { ...payload, request_id: request.requestId };
  };
}

const prepareEventRequest = createCronogramaRequestRegistry();
const eventRequestsInFlight = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();

export async function cronogramaSaveEvent(
  payload: CronogramaSaveEventPayload,
  expectedLockVersion?: number | null,
) {
  const submission = prepareEventRequest(payload, expectedLockVersion);
  const key = `${submission.org_id}:${submission.request_id}`;
  const fingerprint = JSON.stringify(canonicalValue({ submission, version: expectedLockVersion ?? null }));
  const inFlight = eventRequestsInFlight.get(key);
  if (inFlight) {
    if (inFlight.fingerprint !== fingerprint) throw new CronogramaRpcError('CRONOGRAMA_IDEMPOTENCY_KEY_REUSED', codeMessages.CRONOGRAMA_IDEMPOTENCY_KEY_REUSED);
    return inFlight.promise;
  }
  const request = (async () => {
    try {
      const { data, error } = await supabase.rpc('cronograma_save_event', {
        payload: submission as never,
        expected_lock_version: expectedLockVersion ?? undefined,
      });
      if (error) throw normalize(error);
      return data;
    } catch (error) {
      throw error instanceof CronogramaRpcError ? error : normalize(error);
    }
  })();
  eventRequestsInFlight.set(key, { fingerprint, promise: request });
  try {
    return await request;
  } finally {
    if (eventRequestsInFlight.get(key)?.promise === request) eventRequestsInFlight.delete(key);
  }
}

export async function cronogramaSaveSubevent(
  payload: CronogramaSaveSubeventPayload,
  expectedLockVersion?: number | null,
) {
  const { data, error } = await supabase.rpc('cronograma_save_subevent', {
    payload: { request_id: newRequestId(), ...payload } as never,
    expected_lock_version: expectedLockVersion ?? undefined,
  });
  if (error) throw normalize(error);
  return data;
}

export async function cronogramaDeleteSubevent(
  subeventId: string,
  expectedLockVersion?: number | null,
) {
  const { data, error } = await supabase.rpc('cronograma_delete_subevent', {
    subevent_id: subeventId,
    expected_lock_version: expectedLockVersion ?? undefined,
  });
  if (error) throw normalize(error);
  return data;
}

export async function cronogramaDeleteEvent(eventId: string | null, orgId: string, sourceKey: string, expectedLockVersion?: number | null) {
  const { data, error } = await supabase.rpc('cronograma_delete_event', {
    event_id: eventId,
    event_org_id: orgId,
    event_source_key: sourceKey,
    expected_lock_version: expectedLockVersion ?? undefined,
  } as never);
  if (error) throw normalize(error);
  return data;
}

export async function cronogramaReorderSubevents(eventId: string, orderedIds: string[]) {
  const { data, error } = await supabase.rpc('cronograma_reorder_subevents', {
    event_id: eventId,
    ordered_ids: orderedIds,
  });
  if (error) throw normalize(error);
  return data;
}

export interface CronogramaSubeventPlanActionInput {
  start_time?: string | null;
  title: string;
  notes?: string | null;
  responsible_user_id?: string | null;
  responsible_name?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
  is_done?: boolean;
  sort_order?: number;
}

export interface CronogramaSubeventPlanProvisionInput {
  description: string;
  responsible_user_id?: string | null;
  responsible_name?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
  note?: string | null;
  is_done?: boolean;
  sort_order?: number;
}

export interface CronogramaSubeventPlanGuestInput {
  name: string;
  category?: string | null;
  sort_order?: number;
}

export interface CronogramaSubeventPlanItemInput extends Omit<CronogramaSaveSubeventPayload, 'parent_event_id' | 'request_id'> {
  actions?: CronogramaSubeventPlanActionInput[];
  provisions?: CronogramaSubeventPlanProvisionInput[];
  guests?: CronogramaSubeventPlanGuestInput[];
}

export interface CronogramaSaveSubeventPlanPayload {
  parent_event_id: string;
  subevents: CronogramaSubeventPlanItemInput[];
  request_id?: string;
}

/** Persists an entire event plan (subevents + ações + providências + convidados) in one transaction. */
export async function cronogramaSaveSubeventPlan(payload: CronogramaSaveSubeventPlanPayload) {
  const { data, error } = await supabase.rpc('cronograma_save_subevent_plan', {
    payload: { request_id: newRequestId(), ...payload } as never,
  });
  if (error) throw normalize(error);
  return data;
}
