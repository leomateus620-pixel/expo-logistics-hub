import { describe, expect, it, vi } from 'vitest';
import { runWorkerTurn, type WorkerTurnDependencies } from '../../supabase/functions/_shared/workers/engine';
import { interpretWorkerIntent } from '../../supabase/functions/_shared/workers/intent';
import { composeWorkerResponse, humanValue, type ToolEvidence } from '../../supabase/functions/_shared/workers/response-composer';
import { decodeWorkerResponse, encodeWorkerResponse, workerResponseSchema, type WorkerResponse } from '../../supabase/functions/_shared/workers/response-contract';
import { extractPresident2028, PRESIDENT_2028_SOURCE, readInstitutionalPresident } from '../../supabase/functions/_shared/workers/institutional';
import type { WorkerRequest, ReadResult } from '../../supabase/functions/_shared/workers/contracts';

const now = new Date('2026-10-16T12:00:00Z');
const request: WorkerRequest = { orgId: '10000000-0000-4000-8000-000000000001', requestId: '20000000-0000-4000-8000-000000000001', message: 'Como estão as vendas do mapa comercial?' };
const map = { scope: { project_id: '30000000-0000-4000-8000-000000000001', edition_year: 2028, edition_label: 'Fenasoja 2028', complete: true, as_of: now.toISOString() }, metrics: {
  confirmed_value_cents: 12345678, open_value_cents: 700000, confirmed_orders: 125, open_orders: 4, confirmed_lots: 301, open_lots: 8, legacy_lots: 57, cancelled_lots: 3, unverified_lots: 0, unallocated_lots: 0, missing_value_lots: 0,
} };
const appSource = [{ label: 'Mapa Comercial', url: '/mapa-comercial', source: 'app' as const }];
const result = (record: unknown, citations = appSource): ReadResult => ({ summary: 'Resultado calculado no servidor.', records: [record], citations, total: 1 });
const proof = (tool: string, record: unknown): ToolEvidence => ({ tool, input: {}, result: result(record) });
const personal = { scope: { complete: true, as_of: now.toISOString(), period: { from: '2026-10-01', to: '2026-10-31' } }, metrics: { events: 130, created_events: 20, responsible_events: 75, linked_events: 130, past_events: 100, scheduled_events: 30, completed_events: 4, valid_duration_events: 100, average_duration_minutes: 150, weekday_counts: [{ weekday: 4, events: 50 }, { weekday: 5, events: 50 }] } };
const compose = (value: WorkerRequest, evidence: ToolEvidence[]) => decodeWorkerResponse(composeWorkerResponse(value, interpretWorkerIntent(value, now), evidence, now).content)!;

describe('BOT FENASOJA: intent, authorized scope and continuity', () => {
  it('preserves the explicitly requested edition ahead of the current screen and worker', () => {
    expect(interpretWorkerIntent({ ...request, message: 'Como estão as vendas de 2026?', worker: 'agenda', context: { route: '/comissoes/financeiro-2028' } }, now)).toMatchObject({ kind: 'map_sales', worker: 'mapa', editionYear: 2026 });
  });
  it('computes civil month boundaries in São Paulo before UTC has changed month', () => {
    const intent = interpretWorkerIntent({ ...request, message: 'Quantos eventos eu fiz neste mês?' }, new Date('2026-11-01T01:00:00Z'));
    expect(intent.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('keeps the actual resolved metric and filters across repeated follow-ups', () => {
    const value = { ...request, message: 'Quantos eventos eu criei neste mês?' };
    const response = compose(value, [proof('agenda_personal_summary', personal)]);
    const first = interpretWorkerIntent({ ...request, message: 'e no mês anterior?' }, now, [{ role: 'assistant', content: encodeWorkerResponse(response) }]);
    expect(first).toMatchObject({ kind: 'agenda_personal', relationship: 'created', period: { from: '2026-09-01', to: '2026-09-30' } });
    response.metadata.period = first.period;
    expect(interpretWorkerIntent({ ...request, message: 'e no mês anterior?' }, now, [{ role: 'assistant', content: encodeWorkerResponse(response) }])).toMatchObject({ relationship: 'created', period: { from: '2026-08-01', to: '2026-08-31' } });
  });
  it('never presents an aggregate from another edition or period', () => {
    expect(() => compose({ ...request, message: 'Como estão as vendas de 2026?' }, [proof('map_sales_overview', map)])).toThrow('scope_mismatch');
    expect(() => compose({ ...request, message: 'Quantos eventos eu fiz em setembro?' }, [proof('agenda_personal_summary', personal)])).toThrow('scope_mismatch');
  });
  it('retains the authorized project through follow-up, while a different explicit edition triggers new resolution', () => {
    const response = compose(request, [proof('map_sales_overview', map)]);
    const history = [{ role: 'assistant', content: encodeWorkerResponse(response) }];
    expect(interpretWorkerIntent({ ...request, message: 'e no mês anterior?' }, now, history)).toMatchObject({ kind: 'map_sales', projectId: map.scope.project_id, editionYear: 2028 });
    expect(interpretWorkerIntent({ ...request, message: 'e em 2026?' }, now, history).projectId).toBeUndefined();
  });
});

describe('BOT FENASOJA: facts and specific presentation', () => {
  it('refuses a different financial edition and never labels edition-wide totals as monthly', () => {
    const financial = proof('financial_edition_summary', { edition: { code: 'FENASOJA_2028', label: 'Fenasoja 2028' }, expenses: { planned_cents: 12000 } });
    const wrong = compose({ ...request, worker: 'caixa', message: 'Qual é o saldo financeiro de 2026?' }, [financial]);
    expect(wrong.blocks[0].type).toBe('clarification');
    expect(JSON.stringify(wrong.blocks)).not.toContain('12000');
    const month = compose({ ...request, worker: 'caixa', message: 'Qual é o saldo financeiro neste mês?' }, [financial]);
    expect(month.metadata.period).toBeUndefined();
    expect(month.blocks.some(block => block.type === 'indicators')).toBe(false);
    const same = compose({ ...request, worker: 'caixa', message: 'Qual é o saldo financeiro de 2028?' }, [financial]);
    expect(same.metadata.edition).toBe('Fenasoja 2028');
    expect(same.blocks[0]).toMatchObject({ type: 'indicators', items: [{ value: 120, unit: 'BRL' }] });
  });
  it('answers sales first, distinguishes orders/lots, converts cents and hides discovery records', () => {
    const response = compose(request, [proof('map_projects', { name: 'Referência geométrica 2026', is_archived: false }), proof('map_sales_overview', map)]);
    expect(response.summary).toBe('Na Fenasoja 2028, o mapa comercial apresenta:');
    expect(response.blocks[0]).toMatchObject({ type: 'indicators', items: [{ label: 'Vendas realizadas', value: 123456.78, unit: 'BRL' }, { label: 'Vendas em andamento', value: 7000 }] });
    expect(response.blocks.some(block => block.type === 'table')).toBe(false);
    const detailed = compose({ ...request, message: 'Como estão as vendas e quantos pedidos e lotes há no mapa comercial?' }, [proof('map_sales_overview', map)]);
    expect(detailed.blocks[1]).toMatchObject({ type: 'table', rows: [['Com itens confirmados', '125', '301'], ['Com itens em andamento', '4', '8']] });
    expect(JSON.stringify(response.blocks)).not.toMatch(/is_archived|Referência geométrica|SALE_OPEN|CONFIRMED/);
    expect(response.metadata.notes.join(' ')).toContain('pagamento recebido');
  });
  it('keeps missing monetary evidence explicit rather than describing a known subtotal as the total', () => {
    const response = compose(request, [proof('map_sales_overview', { ...map, metrics: { ...map.metrics, missing_value_lots: 2 } })]);
    expect(response.blocks[0]).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ label: 'Valor conhecido das vendas realizadas' })]) });
    expect(response.metadata.notes.join(' ')).toContain('2 itens não possuem valor verificável');
  });
  it('asks a specific question for multiple persisted contexts without showing project fields', () => {
    const response = compose(request, [proof('map_sales_overview', { needs_clarification: true, question: 'Qual edição deseja consultar?', options: ['Fenasoja 2026', 'Fenasoja 2028'] })]);
    expect(response.blocks[0]).toEqual({ type: 'clarification', question: 'Qual edição deseja consultar?', options: ['Fenasoja 2026', 'Fenasoja 2028'] });
  });
  it('does not replace an unavailable aggregate with a capped listing', () => {
    const response = compose(request, [{ tool: 'list_sale_orders', input: {}, result: { ...result({ status: 'CONFIRMED', item_count: 6 }), total: 800, truncated: true } }]);
    expect(response.summary).toContain('Não foi possível calcular');
    expect(response.blocks.some(block => block.type === 'bar_chart' || block.type === 'indicators')).toBe(false);
  });
  it('uses distinct personal events and describes duration coverage without claiming attendance', () => {
    const response = compose({ ...request, message: 'Quantos eventos eu fiz neste mês?' }, [proof('agenda_personal_summary', personal)]);
    expect(response.summary).toBe('Você esteve vinculado a 130 eventos em outubro de 2026.');
    expect(response.metadata.notes.join(' ')).toContain('100 de 130');
    expect(response.metadata.notes.join(' ')).toContain('não comprovam presença');
    expect(response.metadata.notes.join(' ')).toContain('quintas-feiras e sextas-feiras');
    expect(response.blocks.find(block => block.type === 'indicators' && block.items[0].unit === 'minutes')).toMatchObject({ items: [{ value: 150 }] });
  });
  it('renders ranking from the complete authorized aggregation and keeps exact labels and values', () => {
    const response = compose({ ...request, message: 'Mostre um gráfico de barras das pessoas com mais eventos neste mês.' }, [proof('agenda_people_ranking', { scope: personal.scope, metrics: { people_count: 150, event_count: 800 }, people: [{ person_id:'10000000-0000-4000-8000-000000000001',position:1,name: 'Pessoa de Teste A', events: 140 }, { person_id:'10000000-0000-4000-8000-000000000002',position:2,name: 'Pessoa de Teste B', events: 140 }] })]);
    expect(response.blocks[0]).toMatchObject({type:'entity_ranking',entityKind:'person'});
    expect(response.blocks[1]).toMatchObject({ type: 'bar_chart', population: 150, complete: true, data: [{ label: 'Pessoa de Teste A', value: 140 }, { label: 'Pessoa de Teste B', value: 140 }] });
    expect(response.summary).toContain('Empate na liderança');
  });
  it('maps domain terms explicitly and refuses unknown machine-state translations', () => {
    expect(humanValue('SALE_OPEN')).toBe('Venda em andamento');
    expect(humanValue('CONFIRMED')).toBe('Venda confirmada');
    expect(humanValue('WEIRD_INTERNAL_STATE')).toBe('Situação não detalhada');
  });
  it('presents availability and financial concepts according to the selected specialized tool', () => {
    const arena = compose({ ...request, message: 'O Restaurante está disponível?', worker: 'arena' }, [{ tool: 'venue_availability', input: {}, result: { records: [], summary: 'Nenhum conflito.', citations: appSource } }]);
    expect(arena.summary).toContain('Não há conflitos registrados');
    const financial = compose({ ...request, message: 'Como está o financeiro?', worker: 'caixa' }, [proof('financial_edition_summary', { expenses: { planned_cents: 150000, committed_cents: 125000, paid_cents: 50000 }, revenues: { projected_cents: 200000, confirmed_cents: 175000, received_cents: 100000 }, movements: { inflow_cents: 100000, outflow_cents: 50000 } })]);
    expect(financial.blocks[0]).toMatchObject({ type: 'indicators', items: expect.arrayContaining([expect.objectContaining({ label: 'Despesas projetadas', value: 1500 }), expect.objectContaining({ label: 'Despesas comprometidas', value: 1250 }), expect.objectContaining({ label: 'Despesas pagas', value: 500 })]) });
    expect(financial.blocks[1]).toMatchObject({ items: [{ label: 'Saldo dos movimentos registrados', value: 500 }] });
  });
});

describe('BOT FENASOJA: validated contract and durable atomic presentation', () => {
  const valid = () => compose(request, [proof('map_sales_overview', map)]);
  it.each([
    (response: WorkerResponse) => ({ ...response, version: 3 }),
    (response: WorkerResponse) => ({ ...response, html: '<script>bad()</script>' }),
    (response: WorkerResponse) => ({ ...response, blocks: [{ type: 'indicators', items: [{ label: 'Bad', value: Infinity, unit: 'BRL' }] }] }),
    (response: WorkerResponse) => ({ ...response, blocks: [{ type: 'table', columns: ['A'], rows: [['A', 'B']] }] }),
    (response: WorkerResponse) => ({ ...response, metadata: { ...response.metadata, completeness: 'partial' }, blocks: [{ type: 'bar_chart', title: 'Amostra', unit: 'count', data: [{ label: 'A', value: 1 }], population: 1, complete: true }] }),
    (response: WorkerResponse) => ({ ...response, blocks: [{ type: 'bar_chart', title: 'Duplicados', unit: 'count', data: [{ label: 'Ana', value: 1 }, { label: 'Ana', value: 2 }], population: 2, complete: true }] }),
  ])('rejects invalid inner fields, executable configuration and misleading completeness', mutate => expect(workerResponseSchema.safeParse(mutate(valid())).success).toBe(false));
  it('checks evidence and saves before emitting exactly one complete structured delta', async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const deps: WorkerTurnDependencies = { provider: { model: 'local/deterministic', complete: vi.fn() },
      listTools: vi.fn().mockResolvedValue([{ name: 'map_sales_overview', description: 'Agregado', readOnly: true, inputJsonSchema: {} }]), executeTool: vi.fn().mockResolvedValue(result(map)),
      begin: vi.fn().mockResolvedValue({ conversationId: '30000000-0000-4000-8000-000000000002', replayed: false }), finish: vi.fn().mockImplementation(async () => expect(events.some(event => event.event === 'delta')).toBe(false)), fail: vi.fn(), now: () => now };
    await runWorkerTurn(request, deps, (event, data) => events.push({ event, data }));
    expect(deps.provider.complete).not.toHaveBeenCalled();
    expect(deps.executeTool).toHaveBeenCalledWith('map_sales_overview', {});
    const deltas = events.filter(event => event.event === 'delta');
    expect(deltas).toHaveLength(1);
    expect(decodeWorkerResponse((deltas[0].data as { text: string }).text)).not.toBeNull();
  });
  it('resolves a named clarification option against authorized persisted projects without displaying discovery', async () => {
    const clarification = compose(request, [proof('map_sales_overview', { needs_clarification: true, question: 'Qual projeto deseja consultar?', options: ['Parque Sintético A', 'Parque Sintético B'] })]);
    const executeTool = vi.fn().mockImplementation(async (name: string) => name === 'map_projects' ? result({ id: map.scope.project_id, name: 'Parque Sintético A' }) : result(map));
    const finish = vi.fn();
    const deps: WorkerTurnDependencies = { provider: { model: 'local/deterministic', complete: vi.fn() }, listTools: vi.fn().mockResolvedValue(['map_sales_overview', 'map_projects'].map(name => ({ name, description: 'Consulta', readOnly: true, inputJsonSchema: {} }))),
      executeTool, history: vi.fn().mockResolvedValue([{ role: 'assistant', content: encodeWorkerResponse(clarification) }]), begin: vi.fn().mockResolvedValue({ conversationId: '30000000-0000-4000-8000-000000000002', replayed: false }), finish, fail: vi.fn(), now: () => now };
    await runWorkerTurn({ ...request, conversationId: '30000000-0000-4000-8000-000000000002', message: 'Parque Sintético A' }, deps, () => undefined);
    expect(executeTool).toHaveBeenCalledWith('map_sales_overview', { project_id: map.scope.project_id });
    const final = decodeWorkerResponse(finish.mock.calls[0][1].content)!;
    expect(final.summary).toContain('Na Fenasoja 2028');
    expect(JSON.stringify(final.blocks)).not.toContain('Parque Sintético A');
  });
});

describe('BOT FENASOJA: institutional evidence from controlled content', () => {
  const html = '<html><meta property="article:published_time" content="2026-09-09T01:40:13+00:00"/><p>Comandam a Comissão Central, o presidente e o vice-presidente da Fenasoja 2028, Fabiano Soltis e Djeison Fernando Drey, que recepcionaram os coordenadores.</p><img alt="grupo" src="group.jpg"></html>';
  it('extracts the explicit role and civil publication date without inferring biography or photo identity', () => {
    expect(extractPresident2028(html, '2026-10-16')).toMatchObject({ name: 'Fabiano Soltis', edition_year: 2028, published_on: '2026-09-08', verified_on: '2026-10-16' });
    expect(extractPresident2028(html, '2026-10-16')).not.toHaveProperty('photoUrl');
    expect(extractPresident2028('<p>Fabiano Soltis esteve na feira</p>', '2026-10-16')).toBeNull();
  });
  it('fetches only the reviewed HTTPS source, never redirects or a model/user URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(html, { headers: { 'content-type': 'text/html' } }));
    const verified = await readInstitutionalPresident({ edition_year: 2028 }, { fetcher, now });
    expect(fetcher.mock.calls[0][0]).toBe(PRESIDENT_2028_SOURCE);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(verified.citations[0].date).toBe('2026-10-16');
    await expect(readInstitutionalPresident({ url: 'http://169.254.169.254/' }, { fetcher, now })).rejects.toThrow('invalid_tool_arguments');
    expect((await readInstitutionalPresident({ edition_year: 2026 }, { fetcher, now })).records).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not turn search snippets into an institutional profile', () => {
    const response = compose({ ...request, message: 'Qual é o presidente atual da Fenasoja?' }, [proof('workers_web_search', { title: 'Trecho de busca', snippet: 'Alguém é o presidente.' })]);
    expect(response.summary).toContain('evidência institucional suficiente');
    expect(response.blocks.some(block => block.type === 'profile')).toBe(false);
  });
});
