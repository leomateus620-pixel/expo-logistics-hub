import { isObject, type ProviderMessage, type ProviderResponse, type ReadTool, type ToolCall, WorkerError, type WorkerProvider } from './contracts.ts';

export const LOVABLE_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
export const DEFAULT_WORKERS_MODEL = 'google/gemini-3-flash-preview';

export async function readBoundedJson(response: Request | Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new WorkerError('request_too_large', 413);
  const reader = response.body?.getReader();
  if (!reader) throw new WorkerError('invalid_json');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new WorkerError('request_too_large', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError('invalid_json');
  } finally { reader.releaseLock(); }
}

export function createLovableProvider(options: { apiKey?: string; model?: string; fetcher?: typeof fetch }): WorkerProvider {
  const model = options.model?.trim() || DEFAULT_WORKERS_MODEL;
  if (!/^[a-z0-9-]+\/[A-Za-z0-9._-]{1,100}$/.test(model)) throw new WorkerError('provider_not_configured', 503);
  return {
    model,
    async complete(messages: ProviderMessage[], tools: ReadTool[], signal?: AbortSignal): Promise<ProviderResponse> {
      if (!options.apiKey?.trim()) throw new WorkerError('provider_not_configured', 503);
      let response: Response;
      try {
        response = await (options.fetcher ?? fetch)(LOVABLE_GATEWAY_URL, {
          method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, tools: tools.map(tool => ({ type: 'function', function: {
            name: tool.name, description: tool.description, parameters: tool.inputJsonSchema,
          } })), tool_choice: 'auto', parallel_tool_calls: false, temperature: 0, max_tokens: 1600, stream: false }),
        });
      } catch { throw new WorkerError(signal?.aborted ? 'request_cancelled' : 'provider_unavailable', 503); }
      if (!response.ok) {
        // Never return upstream response bodies: they may contain echoed input/secrets.
        await response.body?.cancel();
        throw new WorkerError(response.status === 429 ? 'provider_rate_limited' : response.status === 402 ? 'provider_credits_required' : 'provider_unavailable', response.status === 429 ? 429 : 503);
      }
      const payload = await readBoundedJson(response, 128_000);
      if (!isObject(payload) || !Array.isArray(payload.choices) || !isObject(payload.choices[0]) || !isObject(payload.choices[0].message)) throw new WorkerError('invalid_provider_response', 502);
      const calls = payload.choices[0].message.tool_calls ?? [];
      if (!Array.isArray(calls) || calls.length > 4 || calls.some(call => !isObject(call) || call.type !== 'function'
        || typeof call.id !== 'string' || call.id.length > 100 || !isObject(call.function)
        || typeof call.function.name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(call.function.name)
        || typeof call.function.arguments !== 'string' || call.function.arguments.length > 4000)) throw new WorkerError('invalid_provider_response', 502);
      const usage = isObject(payload.usage) ? payload.usage : {};
      const count = (value: unknown, max: number) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max ? Number(value) : 0;
      const usageReported = Number.isSafeInteger(usage.prompt_tokens) && Number(usage.prompt_tokens) >= 0
        && Number(usage.prompt_tokens) <= 50000 && Number.isSafeInteger(usage.completion_tokens)
        && Number(usage.completion_tokens) >= 0 && Number(usage.completion_tokens) <= 10000;
      return { calls: calls as ToolCall[], inputTokens: count(usage.prompt_tokens, 50000), outputTokens: count(usage.completion_tokens, 10000), usageReported };
    },
  };
}
