import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWorkerTurn, type WorkerTurnDependencies } from '../../supabase/functions/_shared/workers/engine';
import { composeKbResponse, interpretKbQuery, type KbHit, type KbSelection, type KbStatus } from '../../supabase/functions/_shared/workers/knowledge-base';
import { asksForMutation, redactWorkerText, WorkerError, type WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';
import { decodeWorkerResponse, validateWorkerResponseCitations } from '../../supabase/functions/_shared/workers/response-contract';

const now = new Date('2026-10-17T12:00:00-03:00');
const request: WorkerRequest = { orgId: '10000000-0000-4000-8000-000000000001', requestId: '20000000-0000-4000-8000-000000000001', worker: 'comissao', message: 'Quem presidiu a 10ª edição?' };
const conversationId = '30000000-0000-4000-8000-000000000001';
const hit = (overrides: Partial<KbHit> = {}): KbHit => ({ entry_id: 'ED10-PRES', kb: 'fenasoja', score: 0.95, matched_question: request.message, canonical_question: 'Quem foi o presidente da Fenasoja 1994?', answer: 'Rogério Jacob Kerber presidiu a Fenasoja de 1994.', kind: 'fato', status: 'confirmado', area: 'FENASOJA', area_name: 'Fenasoja institucional', as_of: null, edition_number: 10, edition_year: 1994, dynamic_instructions: null,
  sources: [{ label: 'Fenasoja · História e Edições Anteriores', url: 'https://fenasoja.com.br/edicoes-anteriores/', accessed: '2026-10-17' }], kb_version: '2026-10-17', context: { scope: 'edition', subject: 'fenasoja', reference_period: null, valid_from: null, valid_until: null, edition_required: true }, public_notes: [], query_policy: {}, ...overrides });
const outcome: Record<KbStatus, Extract<KbSelection, { type: 'answer' }>['outcome']> = { confirmado: 'answered', parcial: 'answered_with_caveat', conflito: 'answered_with_caveat', dinamico: 'redirected_live', sem_fonte: 'not_confirmed' };
function selection(value = hit(), message = request.message): KbSelection { const query = interpretKbQuery(message, now); return { type: 'answer', hit: value, query, notes: query.notes, outcome: outcome[value.status] }; }
function setup() {
  const deps: WorkerTurnDependencies = {
    provider: { model: 'google/gemini-3-flash-preview', complete: vi.fn().mockResolvedValue({ calls: [], inputTokens: 31, outputTokens: 7 }) },
    listTools: vi.fn().mockResolvedValue([{ name: 'list_events', description: 'Consulta autorizada', readOnly: true, inputJsonSchema: { type: 'object' } }]),
    executeTool: vi.fn(), searchWeb: vi.fn(), institutionalPresident: vi.fn(), memory: vi.fn().mockResolvedValue([]),
    begin: vi.fn().mockResolvedValue({ conversationId, replayed: false }), finish: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined),
    searchKb: vi.fn().mockResolvedValue(selection()), logKb: vi.fn().mockResolvedValue(undefined), now: vi.fn(() => now),
  };
  const events: Array<{ event: string; data: unknown }> = [];
  const emit = (event: string, data: unknown) => { events.push({ event, data }); };
  return { deps, events, emit };
}
afterEach(() => vi.restoreAllMocks());

describe('Contexto público: regressões identificadas na revisão independente', () => {
  it.each(['Quando foi a 10ª edição da Expointer?', 'Quem presidiu a 10ª edição do Musicanto?'])('não aplica calendário da Fenasoja a outra feira: %s', message => {
    expect(interpretKbQuery(message, now)).toMatchObject({ fenasoja: false });
    expect(interpretKbQuery(message, now).editionYear).toBeUndefined();
  });
  it.each(['Qual o preço da soja e do milho hoje?', 'Quem é o presidente e o vice-presidente da Fenasoja 2026?'])('não responde apenas metade de uma pergunta múltipla: %s', message => {
    expect(interpretKbQuery(message, now).clarification).toBeTruthy();
  });
  it('não afirma numeração parcial de 2028 como confirmação oficial', () => {
    const query = interpretKbQuery('Quando será a 26ª Fenasoja?', now);
    expect(query.clarification).toContain('não está confirmada');
    expect(query.notes.join(' ')).not.toContain('Interpretei a 26ª');
  });
});

describe('KB integrada ao motor: persistência, cancelamento e retaguarda', () => {
  it('conclui resposta literal com o bot escolhido, sem planejador/modelo/web e só emite após persistência e log aguardado', async () => {
    const { deps, events, emit } = setup();
    const order: string[] = [];
    vi.mocked(deps.finish).mockImplementation(async (_request, completion) => {
      order.push('finish'); expect(events.some(event => event.event === 'delta')).toBe(false);
      expect(decodeWorkerResponse(completion.content)).toMatchObject({ worker: 'comissao', intent: 'knowledge_base', summary: hit().answer });
      expect(completion).toMatchObject({ tools: ['workers_search_kb'], inputTokens: 0, outputTokens: 0, usageComplete: true, model: 'deterministic/kb.2026-10-17.ED10-PRES' });
    });
    vi.mocked(deps.logKb!).mockImplementation(async () => { order.push('log'); expect(events.some(event => event.event === 'delta')).toBe(false); });
    await runWorkerTurn(request, deps, emit);
    expect(order).toEqual(['finish', 'log']);
    expect(events).toContainEqual({ event: 'worker', data: { workerId: 'comissao' } });
    expect(events).toContainEqual({ event: 'progress', data: { label: 'Consultando a base de conhecimento…', status: 'running' } });
    expect(events[events.length - 1]?.event).toBe('done');
    expect(deps.provider.complete).not.toHaveBeenCalled(); expect(deps.listTools).not.toHaveBeenCalled();
    expect(deps.memory).not.toHaveBeenCalled(); expect(deps.executeTool).not.toHaveBeenCalled();
    expect(deps.searchWeb).not.toHaveBeenCalled(); expect(deps.institutionalPresident).not.toHaveBeenCalled();
    expect(deps.now).toHaveBeenCalledOnce();
  });
  it('recusa admissão sem iniciar busca ou persistência auxiliar', async () => {
    const { deps, emit } = setup();
    vi.mocked(deps.begin).mockRejectedValue(new WorkerError('forbidden', 403));
    await expect(runWorkerTurn(request, deps, emit)).rejects.toThrow('forbidden');
    expect(deps.searchKb).not.toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled();
  });
  it('mantém a proteção de mutações antes da consulta pública', async () => {
    const { deps, emit } = setup();
    await runWorkerTurn({ ...request, message: 'Atualize o preço da soja hoje' }, deps, emit);
    expect(deps.searchKb).not.toHaveBeenCalled(); expect(deps.provider.complete).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ content: expect.stringContaining('Não posso realizar') }));
  });
  it('reconhece Reserva Legal como conceito público mantendo verbos de alteração protegidos', async () => {
    const { deps, emit } = setup();
    const message = 'Qual o percentual de Reserva Legal no RS?';
    expect(asksForMutation(message)).toBe(false);
    for (const mutation of ['Reserve o lote 12', 'Reserva o lote 12', 'Crie uma reserva legal no lote 12', 'Atualize o percentual da Reserva Legal']) expect(asksForMutation(mutation)).toBe(true);
    const legal = hit({ entry_id: 'SUST-LEG-004', kb: 'expandida', edition_year: null, edition_number: null, canonical_question: message, answer: 'A referência é de 20%, observadas as exceções descritas na fonte.', context: { ...hit().context, scope: 'general', subject: 'legislation', edition_required: false } });
    vi.mocked(deps.searchKb!).mockResolvedValue(selection(legal, message));
    await runWorkerTurn({ ...request, message }, deps, emit);
    expect(deps.searchKb).toHaveBeenCalledOnce(); expect(deps.provider.complete).not.toHaveBeenCalled();
    const completion = vi.mocked(deps.finish).mock.calls[0][1];
    expect(decodeWorkerResponse(completion.content)?.summary).toBe(legal.answer);
  });
  it('consulta o público histórico sem fonte e continua recusando publica/publicar/publique', async () => {
    const { deps, events, emit } = setup();
    const message = 'Qual foi o público da Fenasoja 1966?';
    expect(asksForMutation(message)).toBe(false);
    expect(asksForMutation('Qual foi o publico da Fenasoja 1966?')).toBe(false);
    for (const mutation of ['Publicar comunicado', 'Publique comunicado', 'Publica comunicado', 'Quero publicar um comunicado', `${message} Publique um comunicado`]) expect(asksForMutation(mutation)).toBe(true);
    const entry = (JSON.parse(readFileSync('data/kb/fenasoja-kb.json', 'utf8')) as { entries: Array<KbHit & { id: string }> }).entries.find(item => item.id === 'ED01-PUB')!;
    const selected = selection({ ...entry, entry_id: entry.id, score: 1, matched_question: message }, message);
    vi.mocked(deps.searchKb!).mockResolvedValue(selected);
    await runWorkerTurn({ ...request, message }, deps, emit);
    expect(deps.searchKb).toHaveBeenCalledOnce(); expect(deps.provider.complete).not.toHaveBeenCalled();
    const completion = vi.mocked(deps.finish).mock.calls[0][1];
    expect(decodeWorkerResponse(completion.content)).toMatchObject({ summary: entry.answer, metadata: { completeness: 'unavailable' }, blocks: [{ type: 'empty', message: 'Esta informação não está confirmada nas fontes oficiais consultadas.' }] });
    expect(completion.citations).toEqual([]);
    expect(deps.logKb).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: 'not_confirmed' }));
    expect(events).toContainEqual({ event: 'citations', data: { citations: [] } });
  });
  it.each(['Quantos lotes vendemos em 2026?', 'Quais eventos tenho amanhã na agenda?'])('preserva a precedência de ferramenta interna: %s', async message => {
    const { deps, emit } = setup();
    await runWorkerTurn({ ...request, message }, deps, emit);
    expect(deps.searchKb).not.toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled();
    expect(deps.listTools).toHaveBeenCalled();
  });
  it.each([
    ['F26-002', 'Precisava pagar para entrar na Fenasoja?'],
    ['AGRO-LEI-0005', 'Qual a melhor maneira de criar o bezerro: ao pé da mãe ou apartado dela?'],
    ['AGRO-COR-0032', 'Como criar bezerros saudáveis? Quais os cuidados necessários?'],
    ['AGRO-SUI-0385', 'Qual a melhor maneira de criar suínos das raças Landau, Piau e Pirapitinga?'],
    ['AGRO-OVI-0187', 'Qual o período de maior exigência nutricional de ovelhas de cria?'],
    ['AGRO-OVI-0188', 'Como alimentar as ovelhas de cria no período de lactação?'],
    ['MERC-POL-002', 'Quantas pessoas são necessárias para criar uma cooperativa?'],
    ['MERC-POL-002', 'quantas pessoas sao necessaras pra criar uma cooperativa'],
    ['SUST-LEG-007', 'O agro vai ter que pagar pelo carbono?'],
  ])('consulta a pergunta conceitual pública %s sem iniciar ações', async (id, message) => {
    const { deps, emit } = setup();
    const entries = ['fenasoja-kb.json', 'kb-expandida.json'].flatMap(filename => (JSON.parse(readFileSync(`data/kb/${filename}`, 'utf8')) as { entries: Array<KbHit & { id: string }> }).entries);
    const entry = entries.find(item => item.id === id)!;
    expect(asksForMutation(message)).toBe(false);
    vi.mocked(deps.searchKb!).mockResolvedValue(selection({ ...entry, entry_id: entry.id, score: 1, matched_question: message }, message));
    await runWorkerTurn({ ...request, message }, deps, emit);
    expect(deps.searchKb).toHaveBeenCalledOnce(); expect(deps.provider.complete).not.toHaveBeenCalled();
    expect(decodeWorkerResponse(vi.mocked(deps.finish).mock.calls[0][1].content)?.summary).toBe(entry.answer);
  });
  it.each(['Crie um evento sobre criação de suínos', 'Como criar um evento sobre bezerros?', 'Pague a entrada da Fenasoja', 'Quero pagar o ingresso', 'Criar uma cooperativa', 'Reserva de espaço Fenasoja 2028'])('continua recusando ações ou reserva ambígua: %s', async message => {
    const { deps, emit } = setup();
    expect(asksForMutation(message)).toBe(true);
    await runWorkerTurn({ ...request, message }, deps, emit);
    expect(deps.searchKb).not.toHaveBeenCalled(); expect(deps.provider.complete).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ content: expect.stringContaining('Não posso realizar') }));
  });
  it('registra miss somente depois do fluxo substituto e mantém os tokens realmente utilizados', async () => {
    const { deps, emit } = setup();
    vi.mocked(deps.searchKb!).mockResolvedValue(null);
    vi.mocked(deps.logKb!).mockImplementation(async (_request, value) => { expect(deps.finish).toHaveBeenCalledOnce(); expect(value).toBeNull(); });
    await runWorkerTurn(request, deps, emit);
    expect(deps.provider.complete).toHaveBeenCalled();
    expect(deps.listTools).toHaveBeenCalledWith('radar');
    expect(vi.mocked(deps.provider.complete).mock.calls[0][1].some(tool => tool.name === 'workers_search_kb')).toBe(false);
    expect(deps.finish).toHaveBeenCalledWith(request, expect.objectContaining({ inputTokens: 31, outputTokens: 7, tools: ['workers_search_kb'] }));
    expect(deps.logKb).toHaveBeenCalledWith(request, null);
  });
  it('mantém o caminho anterior quando searchKb não foi fornecido', async () => {
    const { deps, emit } = setup(); delete deps.searchKb;
    await runWorkerTurn(request, deps, emit);
    expect(deps.provider.complete).toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled();
  });
  it('não transforma falha de disponibilidade em miss nem registra conteúdo no diagnóstico', async () => {
    const { deps, emit } = setup();
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(deps.searchKb!).mockRejectedValue(new Error('Conteúdo privado de uma falha upstream'));
    await runWorkerTurn(request, deps, emit);
    expect(deps.provider.complete).toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled();
    const logs = diagnostic.mock.calls.flat().join(' ');
    expect(vi.mocked(deps.finish).mock.calls[0][1].tools).not.toContain('workers_search_kb');
    expect(logs).toContain('kb_search'); expect(logs).not.toContain('Conteúdo privado'); expect(logs).not.toContain(request.message);
  });
  it.each([401, 403])('não inicia retaguarda após recusa de autenticação/acesso %s', async status => {
    const { deps, emit } = setup();
    vi.mocked(deps.searchKb!).mockRejectedValue(new WorkerError('forbidden', status));
    await expect(runWorkerTurn(request, deps, emit)).rejects.toThrow('forbidden');
    expect(deps.provider.complete).not.toHaveBeenCalled(); expect(deps.finish).not.toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled();
  });
  it('cancela antes de admitir e durante a busca sem iniciar outro caminho', async () => {
    const first = setup(), before = new AbortController(); before.abort(); first.deps.signal = before.signal;
    await expect(runWorkerTurn(request, first.deps, first.emit)).rejects.toThrow('request_cancelled');
    expect(first.deps.begin).not.toHaveBeenCalled();
    const second = setup(), during = new AbortController(); second.deps.signal = during.signal;
    vi.mocked(second.deps.searchKb!).mockImplementation(async () => { during.abort(); return selection(); });
    await expect(runWorkerTurn(request, second.deps, second.emit)).rejects.toThrow('request_cancelled');
    expect(second.deps.finish).not.toHaveBeenCalled(); expect(second.deps.logKb).not.toHaveBeenCalled(); expect(second.deps.listTools).not.toHaveBeenCalled();
    expect(second.events.some(event => event.event === 'delta')).toBe(false);
  });
  it('falha principal não gera evento KB e falha isolada do log não derruba a resposta', async () => {
    const failed = setup(); vi.mocked(failed.deps.finish).mockRejectedValue(new WorkerError('sql_error', 503));
    await expect(runWorkerTurn(request, failed.deps, failed.emit)).rejects.toThrow('sql_error');
    expect(failed.deps.logKb).not.toHaveBeenCalled(); expect(failed.events.some(event => event.event === 'delta')).toBe(false);
    const completed = setup(); const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(completed.deps.logKb!).mockRejectedValue(new Error('Texto secreto do banco'));
    await runWorkerTurn(request, completed.deps, completed.emit);
    expect(completed.events[completed.events.length - 1]?.event).toBe('done'); expect(completed.deps.fail).not.toHaveBeenCalled();
    expect(diagnostic.mock.calls.flat().join(' ')).toContain('kb_telemetry');
    expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('Texto secreto');
  });
  it('replay conserva a resposta persistida e a identidade admitida sem duplicar log ou consulta', async () => {
    const { deps, events, emit } = setup();
    const saved = composeKbResponse(request, selection(), now, 'arena');
    vi.mocked(deps.begin).mockResolvedValue({ conversationId, replayed: true, workerId: 'arena', ...saved });
    await runWorkerTurn(request, deps, emit);
    expect(deps.searchKb).not.toHaveBeenCalled(); expect(deps.finish).not.toHaveBeenCalled(); expect(deps.logKb).not.toHaveBeenCalled(); expect(deps.provider.complete).not.toHaveBeenCalled();
    expect(events).toContainEqual({ event: 'worker', data: { workerId: 'arena' } });
    expect(events).toContainEqual({ event: 'delta', data: { text: saved.content } });
    expect(events).toContainEqual({ event: 'citations', data: { citations: saved.citations } });
  });
  it('troca concorrente refaz seleção e composição uma vez com o mesmo relógio sem emitir a versão antiga', async () => {
    const { deps, events, emit } = setup();
    const revised = selection(hit({ answer: 'Texto revisado da nova versão da fixture.', kb_version: '2026-10-18', sources: [{ label: 'Nova fonte da revisão', url: 'https://fenasoja.com.br/historia/', accessed: '2026-10-18' }] }));
    vi.mocked(deps.searchKb!).mockResolvedValueOnce(selection()).mockResolvedValueOnce(revised);
    vi.mocked(deps.finish).mockRejectedValueOnce(new WorkerError('kb_version_changed', 409)).mockResolvedValue(undefined);
    await runWorkerTurn(request, deps, emit);
    expect(deps.searchKb).toHaveBeenCalledTimes(2); expect(deps.now).toHaveBeenCalledOnce(); expect(deps.finish).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(deps.searchKb!).mock.calls) expect(call[1]).toBe(now);
    const emitted = events.filter(event => event.event === 'delta').map(event => (event.data as { text: string }).text).join('');
    expect(decodeWorkerResponse(emitted)?.summary).toBe('Texto revisado da nova versão da fixture.');
    expect(emitted).not.toContain(hit().answer);
    expect(deps.logKb).toHaveBeenCalledExactlyOnceWith(request, revised);
  });
  it('uma segunda troca de versão falha sem retry ilimitado nem evento auxiliar', async () => {
    const { deps, events, emit } = setup();
    vi.mocked(deps.finish).mockRejectedValue(new WorkerError('kb_version_changed', 409));
    await expect(runWorkerTurn(request, deps, emit)).rejects.toThrow('kb_version_changed');
    expect(deps.searchKb).toHaveBeenCalledTimes(2); expect(deps.finish).toHaveBeenCalledTimes(2); expect(deps.logKb).not.toHaveBeenCalled();
    expect(events.some(event => event.event === 'delta')).toBe(false);
  });
});

describe('Acervo revisado: composição integral sem truncamento', () => {
  it('preserva oito notas no orçamento completo e rejeita uma nona sem truncamento', () => {
    const value = hit({ kind: 'dado', status: 'parcial', as_of: '1994', public_notes: ['Primeira ressalva pública.', 'Segunda ressalva pública.', 'Terceira ressalva pública.'] });
    const selected = selection(value);
    if (selected.type !== 'answer') throw new Error('Answer fixture required');
    selected.notes = ['Interpretação de edição.', 'Interpretação da edição anterior.', 'Pergunta relacionada na base: referência compatível.'];
    const composed = composeKbResponse(request, selected, now);
    const response = decodeWorkerResponse(composed.content)!;
    expect(response.metadata.notes).toHaveLength(8);
    expect(response.metadata.notes.slice(0, 6)).toEqual([...selected.notes, ...value.public_notes]);
    expect(response.summary).toBe(value.answer);
    selected.hit = { ...value, public_notes: [...value.public_notes, 'Quarta ressalva pública.'] };
    expect(() => composeKbResponse(request, selected, now)).toThrow();
  });
  it('compõe todas as 2.786 entradas e conserva texto, ressalvas, datas e fonte no documento serializado', () => {
    const entries = ['fenasoja-kb.json', 'kb-expandida.json'].flatMap(filename => (JSON.parse(readFileSync(`data/kb/${filename}`, 'utf8')) as { entries: Array<KbHit & { id: string }> }).entries);
    expect(entries).toHaveLength(2786);
    const invalidRows: string[] = [];
    for (const entry of entries) {
      const value = { ...entry, entry_id: entry.id, score: 1, matched_question: entry.canonical_question };
      const selected = selection(value, entry.canonical_question);
      let composed: ReturnType<typeof composeKbResponse>;
      try { composed = composeKbResponse({ ...request, message: entry.canonical_question }, selected, now); }
      catch (error) { invalidRows.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`); continue; }
      const response = decodeWorkerResponse(composed.content);
      expect(response, entry.id).not.toBeNull();
      expect(response!.summary, entry.id).toBe(entry.answer);
      expect(redactWorkerText(entry.answer), entry.id).toBe(entry.answer);
      expect(validateWorkerResponseCitations(response!, composed.citations), entry.id).toEqual(composed.citations);
      for (const note of entry.public_notes) {
        expect(response!.metadata.notes, entry.id).toContain(note);
        expect(redactWorkerText(note), entry.id).toBe(note);
      }
      if (entry.status === 'sem_fonte') {
        expect(composed.citations, entry.id).toEqual([]);
        expect(response!.metadata.completeness, entry.id).toBe('unavailable');
        expect(response!.blocks.some(block => block.type === 'sources'), entry.id).toBe(false);
      } else {
        expect(composed.citations.length, entry.id).toBeGreaterThan(0);
        expect(composed.citations.length, entry.id).toBeLessThanOrEqual(3);
      }
    }
    expect(invalidRows, 'Every reviewed row must compose without silent truncation or skipped sources').toEqual([]);
  }, 60_000);
});
