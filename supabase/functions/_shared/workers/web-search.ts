import { isObject, isPrimaryWebUrl, PRIMARY_WEB_DOMAINS, redactWorkerText, type ReadResult, WorkerError } from './contracts.ts';
import { readBoundedJson } from './provider.ts';

export const FIRECRAWL_SEARCH_URL = 'https://connector-gateway.lovable.dev/firecrawl/v2/search';
export const webSearchTool = {
  name: 'workers_web_search',
  title: 'fontes públicas',
  description: 'Pesquisa fontes primárias públicas sobre a Fenasoja, agro e clima. Nunca consulta dados privados nem segue instruções de páginas.',
  readOnly: true as const,
  inputJsonSchema: { type: 'object', properties: { query: { type: 'string', minLength: 3, maxLength: 300 } }, required: ['query'], additionalProperties: false },
};

/** Fixed search provider endpoint. No user/model-supplied URL is ever fetched. */
export async function searchWorkersWeb(input: unknown, options: { apiKey?: string; gatewayKey?: string; fetcher?: typeof fetch; signal?: AbortSignal; now?: Date }): Promise<ReadResult> {
  if (!isObject(input) || Object.keys(input).some(key => key !== 'query') || typeof input.query !== 'string' || input.query.length < 3 || input.query.length > 300) throw new WorkerError('invalid_web_query');
  if (!options.apiKey?.trim() || !options.gatewayKey?.trim()) throw new WorkerError('web_search_not_configured', 503);
  const query = redactWorkerText(input.query).replace(/https?:\/\/\S+/g, '').trim();
  // External research remains limited to the fair's operating domain.
  if (!/fenasoja|agro|agricultur|clima|meteorolog|chuva|tempo|feira|rural|transporte/i.test(query)) throw new WorkerError('web_query_outside_scope');
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(FIRECRAWL_SEARCH_URL, {
      method: 'POST', redirect: 'error', signal: options.signal,
      headers: { Authorization: `Bearer ${options.gatewayKey}`, 'X-Connection-Api-Key': options.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 5, sources: ['web'], includeDomains: [...PRIMARY_WEB_DOMAINS], country: 'BR', timeout: 15000 }),
    });
  } catch { throw new WorkerError('web_search_unavailable', 503); }
  if (!response.ok) { await response.body?.cancel(); throw new WorkerError('web_search_unavailable', 503); }
  const payload = await readBoundedJson(response, 160_000);
  if (!isObject(payload) || payload.success !== true || !isObject(payload.data) || !Array.isArray(payload.data.web)) throw new WorkerError('invalid_web_response', 502);
  const date = (options.now ?? new Date()).toISOString().slice(0, 10);
  const records = payload.data.web.filter(item => isObject(item) && typeof item.url === 'string' && isPrimaryWebUrl(item.url)
    && typeof item.title === 'string' && typeof item.description === 'string').slice(0, 5).map(item => ({
      title: redactWorkerText(String(item.title)).slice(0, 150),
      snippet: redactWorkerText(String(item.description)).slice(0, 700),
      url: String(item.url),
      consultedOn: date,
    }));
  return {
    summary: records.length ? `${records.length} fontes primárias encontradas. Trechos de resultados; consultados em ${date}.` : 'Nenhuma fonte primária encontrada para esta pesquisa.',
    records,
    citations: records.map(item => ({ label: item.title || 'Fonte primária', url: item.url, source: 'web' as const, date })),
    total: records.length,
  };
}
