import { describe, expect, it } from 'vitest';
import { isKbSourceDate, isSafeKbSourceUrl } from '../../supabase/functions/_shared/workers/kb-source';
import { isPrimaryWebUrl, validateCitations, type WorkerCitation } from '../../supabase/functions/_shared/workers/contracts';
import { decodeWorkerResponse, encodeWorkerResponse, validateWorkerResponseCitations, type WorkerResponse } from '../../supabase/functions/_shared/workers/response-contract';
import { validateToolEvidence } from '../../supabase/functions/_shared/workers/response-composer';

const citation: WorkerCitation = { label: 'Emater/RS · referência do acervo', url: 'https://www.emater.tche.br/site/servicos/precos-agropecuarios.php', source: 'kb', date: '2026-10-17' };
const response = (): WorkerResponse => ({ version: 1, worker: 'radar', intent: 'knowledge_base', summary: 'Orientação revisada para esta fixture.',
  metadata: { organizationId: '10000000-0000-4000-8000-000000000001', scope: 'Base de conhecimento pública · Mercado', timezone: 'America/Sao_Paulo', updatedAt: '2026-10-17T12:00:00Z', completeness: 'partial', notes: ['Este dado muda com frequência.'] },
  blocks: [{ type: 'sources', items: [citation] }] });

describe('Fontes KB: contrato público e evidências', () => {
  it('aceita a fonte pública registrada sem ampliar os domínios da pesquisa web', () => {
    expect(isSafeKbSourceUrl(citation.url)).toBe(true);
    expect(isPrimaryWebUrl(citation.url)).toBe(false);
    expect(validateCitations([citation])).toEqual([citation]);
    expect(() => validateCitations([{ ...citation, source: 'web' }])).toThrow('invalid_citations');
    expect(validateToolEvidence({ summary: 'Orientação revisada.', records: [{ status: 'dinamico' }], total: 1, citations: [citation] })).toEqual([citation]);
  });
  it.each([
    'http://www.emater.tche.br/', 'https://user:pass@www.emater.tche.br/', 'https://www.emater.tche.br:8443/',
    'https://localhost/', 'https://machine.local/', 'https://api.internal/', 'https://127.1/', 'https://2130706433/',
    'https://0x7f000001/', 'https://10.1.1.1/', 'https://172.20.1.1/', 'https://192.168.0.1/', 'https://[::1]/', 'https://[fc00::1]/',
    'https://www.emater.tche.br/areas/lote/token', 'https://www.emater.tche.br/%61reas/lote/token',
    'https://www.emater.tche.br/%2561reas/lote/token', 'https://www.emater.tche.br/x/../areas/token',
    'https://www.emater.tche.br//areas/token', 'https://www.emater.tche.br/?%74oken=secret',
    'https://www.emater.tche.br/?cpf=123', 'https://www.emater.tche.br/?api_key=secret',
    'https://www.emater.tche.br/?pix=secret', 'https://www.emater.tche.br/white space',
    'https://www.emater.tche.br/%0a', 'https://www.emater.tche.br/%invalid', 'https://www.emater.tche.br/`',
    'https://www.emater.tche.br/?q=%0a', 'https://www.emater.tche.br/#%00', 'https://host.localdomain/',
    'https://www.emater.tche.br./', 'https://www.emater.tche.br/x/areas/token',
    'https://www.emater.tche.br/?signature=secret', 'https://www.emater.tche.br/?sig=secret', 'https://www.emater.tche.br/?q="text"',
    'https://www.emater.tche.br/?%69tem=123',
  ])('rejeita endereço inseguro: %s', url => {
    expect(isSafeKbSourceUrl(url)).toBe(false);
    expect(() => validateCitations([{ ...citation, url }])).toThrow('invalid_citations');
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-10', '2026-13-10', '0000-01-01', '2026-10-17T12:00:00Z', 's.d.', null, undefined])('rejeita data civil inválida: %s', date => {
    expect(isKbSourceDate(date)).toBe(false);
    expect(() => validateCitations([{ ...citation, date }])).toThrow('invalid_citations');
  });
  it('preserva datas civis reais e o limite das fontes ao codificar e reabrir', () => {
    expect(isKbSourceDate('2024-02-29')).toBe(true);
    const document = response();
    const content = encodeWorkerResponse(document);
    expect(decodeWorkerResponse(content)).toEqual(document);
    expect(validateWorkerResponseCitations(decodeWorkerResponse(content)!, [citation])).toEqual([citation]);
    expect(() => validateCitations([{ ...citation, label: 'a'.repeat(161) }])).toThrow('invalid_citations');
    expect(() => encodeWorkerResponse({ ...document, blocks: [{ type: 'sources', items: [{ ...citation, label: 'a'.repeat(161) }] }] })).toThrow();
    expect(() => encodeWorkerResponse({ ...document, blocks: [{ type: 'sources', items: [citation, citation] }] })).toThrow();
    expect(() => encodeWorkerResponse({ ...document, blocks: [{ type: 'sources', items: Array.from({ length: 4 }, (_, i) => ({ ...citation, url: `${citation.url}?item=${i}` })) }] })).toThrow();
  });
  it('recusa divergência de URL, tipo, data ou quantidade entre bloco e transporte', () => {
    for (const sources of [[], [{ ...citation, date: '2026-10-16' }], [{ ...citation, url: 'https://www.emater.tche.br/' }], [{ ...citation, source: 'web' }], [citation, citation]]) {
      expect(() => validateWorkerResponseCitations(response(), sources)).toThrow('invalid_citations');
    }
    expect(validateWorkerResponseCitations({ ...response(), metadata: { ...response().metadata, completeness: 'unavailable' }, blocks: [{ type: 'empty', message: 'Esta informação não está confirmada nas fontes oficiais consultadas.' }] }, [])).toEqual([]);
  });
  it('preserva o limite legado de rótulos app/web ao reabrir documentos anteriores', () => {
    const document = response();
    document.intent = 'institutional';
    document.blocks = [{ type: 'sources', items: [{ label: 'a'.repeat(180), url: 'https://fenasoja.com.br/', source: 'web', date: '2026-10-17' }, { label: 'b'.repeat(180), url: '/cronograma-eventos', source: 'app' }] }];
    expect(decodeWorkerResponse(encodeWorkerResponse(document))).toEqual(document);
    // New transport citations retain their existing, stricter 160-character boundary.
    expect(() => validateCitations([{ label: 'a'.repeat(180), url: 'https://fenasoja.com.br/', source: 'web', date: '2026-10-17' }])).toThrow('invalid_citations');
  });
});
