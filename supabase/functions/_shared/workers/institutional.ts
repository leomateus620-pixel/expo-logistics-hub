import { isObject, redactWorkerText, type ReadResult, WorkerError } from './contracts.ts';

// Source identifiers resolve to reviewed public pages. Neither the user nor the model supplies a URL.
export const PRESIDENT_2028_SOURCE = 'https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/';
export const institutionalTool = {
  name: 'workers_institutional_president', title: 'publicação institucional', readOnly: true as const,
  description: 'Consulta o conteúdo integral da publicação institucional revisada que nomeia a presidência da Fenasoja 2028. Preserva data, edição e data de verificação. Não comprova biografia nem presença em fotos.',
  inputJsonSchema: { type: 'object', properties: { edition_year: { type: 'integer', minimum: 1966, maximum: 2100 } }, required: ['edition_year'], additionalProperties: false },
};

async function readHtml(response: Response): Promise<string> {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new WorkerError('institutional_source_unavailable', 503); }
  const reader = response.body?.getReader();
  if (!reader) throw new WorkerError('institutional_source_unavailable', 503);
  let size = 0, html = ''; const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 750_000) { await reader.cancel(); throw new WorkerError('institutional_source_unavailable', 503); }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally { reader.releaseLock(); }
}
const plain = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#8211;|&ndash;/gi, '–').replace(/\s+/g, ' ').trim();

/** Extract only the explicit named appointment; snippets and page photographs are not identity evidence. */
export function extractPresident2028(html: string, verifiedOn: string): Record<string, unknown> | null {
  const body = plain(html);
  const match = /o presidente e o vice-presidente da Fenasoja (20\d{2}),\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{2,100}?)\s+e\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{2,100}?),/i.exec(body);
  const publishedTimestamp = /(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i.exec(html)?.[1];
  const timestamp = publishedTimestamp ? new Date(publishedTimestamp) : null;
  const published = timestamp && Number.isFinite(timestamp.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp) : undefined;
  if (!match || Number(match[1]) !== 2028 || !published) return null;
  return { name: redactWorkerText(match[2]).trim(), role: 'Presidente da Fenasoja', edition: 'Fenasoja 2028', edition_year: 2028,
    published_on: published, verified_on: verifiedOn, evidence_kind: 'official_content',
    evidence: `Publicação oficial identifica ${match[2].trim()} como presidente da Fenasoja ${match[1]}.` };
}

export async function readInstitutionalPresident(input: unknown, options: { fetcher?: typeof fetch; signal?: AbortSignal; now?: Date } = {}): Promise<ReadResult> {
  if (!isObject(input) || Object.keys(input).some(key => key !== 'edition_year') || input.edition_year !== undefined && (!Number.isInteger(input.edition_year) || Number(input.edition_year) < 1966 || Number(input.edition_year) > 2100)) throw new WorkerError('invalid_tool_arguments');
  const now = options.now ?? new Date();
  if (input.edition_year !== 2028) return { summary: 'A fonte revisada não comprova a presidência da edição solicitada.', records: [], citations: [], total: 0 };
  let response: Response;
  try { response = await (options.fetcher ?? fetch)(PRESIDENT_2028_SOURCE, { redirect: 'error', signal: options.signal, headers: { Accept: 'text/html' } }); }
  catch { throw new WorkerError(options.signal?.aborted ? 'request_cancelled' : 'institutional_source_unavailable', 503); }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const record = extractPresident2028(await readHtml(response), date);
  return { summary: record ? 'Presidência identificada em conteúdo institucional com edição e publicação explícitas.' : 'O conteúdo consultado não comprova a presidência com segurança.', records: record ? [record] : [], total: record ? 1 : 0,
    citations: [{ label: 'Fenasoja: anúncio da Comissão Central 2028', url: PRESIDENT_2028_SOURCE, source: 'web', date }] };
}
