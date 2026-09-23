/**
 * Erro de venda com duas camadas: mensagem segura para a tela e diagnóstico técnico
 * sanitizado (sem dados pessoais, token ou payload completo).
 */
export type SalesErrorKind =
  | 'BUSINESS'      // regra comercial (lote indisponível, total divergente...)
  | 'AUTH'          // sessão expirada ou permissão insuficiente
  | 'SCHEMA'        // erro interno do banco (coluna/função)
  | 'NETWORK'       // falha de comunicação — resultado indeterminado
  | 'UNKNOWN';

export interface SalesErrorDiagnostics {
  operation: 'register_commercial_sale_order';
  kind: SalesErrorKind;
  correlationId: string;
  code: string | null;
  details: string | null;
  hint: string | null;
  rawMessage: string | null;
  httpStatus: number | null;
  stage: string;
  lotCount: number;
}

export class SalesOrderError extends Error {
  readonly diagnostics: SalesErrorDiagnostics;
  /** true quando não se pode afirmar que nada foi gravado (timeout/rede). */
  readonly indeterminate: boolean;

  constructor(message: string, diagnostics: SalesErrorDiagnostics) {
    super(message);
    this.name = 'SalesOrderError';
    this.diagnostics = diagnostics;
    this.indeterminate = diagnostics.kind === 'NETWORK';
  }
}

const SENSITIVE = /(\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b)|(\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b)|([\w.+-]+@[\w-]+\.[\w.]+)|(\(?\d{2}\)?\s?9?\d{4}-?\d{4})|(Bearer\s+\S+)|(eyJ[\w-]{10,})/gi;

/** Remove documento, e-mail, telefone e credenciais de textos técnicos. */
export function sanitizeDiagnosticText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(SENSITIVE, '[oculto]').slice(0, 600);
}

const BUSINESS_CODES = [
  'LOT_NOT_SELLABLE', 'LOT_WITHOUT_OFFICIAL_PRICE', 'LOT_UNAVAILABLE_OR_MISSING',
  'TOTAL_MISMATCH', 'INSTALLMENTS_MISMATCH', 'LOT_PROJECT_MISMATCH', 'BUYER_REQUIRED',
  'INVALID_STAGE', 'NO_LOTS_SELECTED', 'IDEMPOTENCY_KEY_REQUIRED', 'LOT_NOT_FOUND',
];

export function classifySalesError(message: string, code: string | null): SalesErrorKind {
  if (/AUTH_REQUIRED|MAP_PERMISSION_DENIED|JWT|not authenticated/i.test(message)) return 'AUTH';
  if (BUSINESS_CODES.some((token) => message.includes(token))) return 'BUSINESS';
  if (code === '42703' || code === '42P01' || code === '42883' || /undefined_column|does not exist/i.test(message)) {
    return 'SCHEMA';
  }
  if (/Failed to fetch|NetworkError|timeout|aborted|ECONN/i.test(message)) return 'NETWORK';
  return 'UNKNOWN';
}

/** Evento estruturado de observabilidade — nunca carrega dados pessoais. */
export function logSalesFailure(diagnostics: SalesErrorDiagnostics): void {
  console.error('commercial_sale_order_failed', diagnostics);
}
