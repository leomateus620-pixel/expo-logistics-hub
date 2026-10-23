import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const reportSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['requested', 'querying', 'rendering', 'ready', 'error', 'expired']),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
}).strip();
const statusSchema = z.object({ report: reportSchema.nullable() }).strip();
export type CommercialReportJob = z.infer<typeof reportSchema>;
export interface CommercialReportRequest {
  orgId: string;
  snapshotId: string;
  reportId?: string;
  conversationId?: string;
}

/** Public messages are local and fixed: database errors and private URLs stay on the server. */
export class CommercialReportError extends Error {
  constructor(readonly code: 'access_denied' | 'expired' | 'unavailable' | 'invalid_response') {
    super(code === 'access_denied' ? 'Seu acesso a este relatório não está disponível. Consulte a equipe responsável.'
      : code === 'expired' ? 'A validade desta emissão terminou. Atualize os dados para gerar um novo relatório.'
        : code === 'invalid_response' ? 'Não foi possível validar o relatório recebido. Tente novamente.'
          : 'Não foi possível consultar o relatório agora. Tente novamente.');
    this.name = 'CommercialReportError';
  }
}

async function reportRequest(operation: 'prepare' | 'status' | 'download' | 'plan', request: CommercialReportRequest, signal?: AbortSignal): Promise<Response> {
  const parsed = z.object({ orgId: z.string().uuid(), snapshotId: z.string().uuid(), reportId: z.string().uuid().optional(), conversationId: z.string().uuid().optional() }).strict().safeParse(request);
  if (!parsed.success) throw new CommercialReportError('invalid_response');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new CommercialReportError('access_denied');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new CommercialReportError('unavailable');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/functions/v1/workers-commercial-reports`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, ...parsed.data }),
    });
  } catch (cause) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new CommercialReportError('unavailable');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new CommercialReportError([401, 403, 404].includes(response.status) ? 'access_denied' : response.status === 410 ? 'expired' : 'unavailable');
  }
  return response;
}

export async function readCommercialReport(request: CommercialReportRequest, signal?: AbortSignal): Promise<CommercialReportJob | null> {
  const response = await reportRequest('status', request, signal);
  try { return statusSchema.parse(await response.json()).report; }
  catch { throw new CommercialReportError('invalid_response'); }
}

export async function prepareCommercialReport(request: CommercialReportRequest, signal?: AbortSignal): Promise<CommercialReportJob> {
  const response = await reportRequest('prepare', request, signal);
  try {
    const report = statusSchema.parse(await response.json()).report;
    if (!report) throw new Error('Missing report');
    return report;
  } catch { throw new CommercialReportError('invalid_response'); }
}

/** A mediated PDF response is the only download source; no model URL is followed or persisted. */
export async function downloadCommercialReport(request: CommercialReportRequest & { reportId: string }, signal?: AbortSignal): Promise<Blob> {
  const response = await reportRequest('download', request, signal);
  if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/pdf')) {
    await response.body?.cancel().catch(() => undefined);
    throw new CommercialReportError('invalid_response');
  }
  const file = await response.blob();
  if (!file.size) throw new CommercialReportError('invalid_response');
  return file;
}

export async function readCommercialPlan(request: CommercialReportRequest, signal?: AbortSignal): Promise<unknown> {
  const response = await reportRequest('plan', request, signal);
  try { return await response.json(); }
  catch { throw new CommercialReportError('invalid_response'); }
}

export function saveCommercialReport(file: Blob, title: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 120).trim() || 'Relatório comercial'}.pdf`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari may read the object after the click callback finishes.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
