import { supabase } from '@/integrations/supabase/client';

export type CronogramaRpcErrorCode =
  | 'CRONOGRAMA_NOT_FOUND'
  | 'CRONOGRAMA_PERMISSION_DENIED'
  | 'CRONOGRAMA_VALIDATION_ERROR'
  | 'CRONOGRAMA_CONFLICT'
  | 'CRONOGRAMA_RELATIONSHIP_INVALID'
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
  CRONOGRAMA_UNKNOWN: 'Falha ao processar a operação.',
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
  event_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
  responsible_name?: string | null;
  has_exact_date?: boolean;
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
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function cronogramaSaveEvent(
  payload: CronogramaSaveEventPayload,
  expectedLockVersion?: number | null,
) {
  const { data, error } = await supabase.rpc('cronograma_save_event', {
    payload: { request_id: newRequestId(), ...payload } as never,
    expected_lock_version: expectedLockVersion ?? undefined,
  });
  if (error) throw normalize(error);
  return data;
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

export async function cronogramaReorderSubevents(eventId: string, orderedIds: string[]) {
  const { data, error } = await supabase.rpc('cronograma_reorder_subevents', {
    event_id: eventId,
    ordered_ids: orderedIds,
  });
  if (error) throw normalize(error);
  return data;
}
