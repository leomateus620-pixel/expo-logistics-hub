import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { composeKbResponse, interpretKbQuery, kbCitations, KB_THRESHOLDS, selectKbHit, searchKnowledgeBase, type KbHit, type KbSelection } from '../../supabase/functions/_shared/workers/knowledge-base';
import { decodeWorkerResponse, validateWorkerResponseCitations } from '../../supabase/functions/_shared/workers/response-contract';
import { redactWorkerText } from '../../supabase/functions/_shared/workers/contracts';

const now = new Date('2026-10-17T15:00:00Z');
const entries = ['fenasoja-kb.json', 'kb-expandida.json'].flatMap(file => JSON.parse(readFileSync(`data/kb/${file}`, 'utf8')).entries) as Array<KbHit & { id: string; variants: string[] }>;
const hit = (id: string, score = 1): KbHit => { const entry = entries.find(item => item.id === id)!; return { ...entry, entry_id: id, score, matched_question: entry.canonical_question }; };
const request = { orgId: '10000000-0000-4000-8000-000000000001', requestId: '20000000-0000-4000-8000-000000000001', message: 'Pergunta pública', worker: 'mapa' as const };

describe('public KB: calendar and context before similarity', () => {
  it.each([
    ['Quem foi o presidente da Fenasoja 2024?', 2024], ['Quem presidiu a 10ª edição?', 1994],
    ['Quando foi a décima Fenasoja?', 1994], ['Quem presidiu a oitava Fenasoja?', 1990],
    ['Quem presidiu a vigésima primeira Fenasoja?', 2016], ['Quem presidiu a edição 10?', 1994],
    ['Quem é o presidente da Fenasoja?', 2028], ['Quem foi o presidente da Fenasoja?', 2026],
    ['Quando ocorreu a Fenasoja?', 2026], ['Quem presidia a Fenasoja?', 2026],
    ['Quem será o presidente da Fenasoja 2030?', 2030], ['Quando foi a edição anterior à edição de 1994?', 1992],
    ['Quem será o presidente da Fenasoja seguinte à de 2026?', 2028],
    ['Teve Fenasoja em 2020?', 2020], ['Quanto custa o estacionamento da próxima Fenasoja?', 2028],
  ])('%s resolves %s', (message, editionYear) => expect(interpretKbQuery(message, now).editionYear).toBe(editionYear));
  it('keeps comparative history, other fairs and crop years out of Fenasoja edition context', () => {
    for (const text of ['Qual edição da Fenasoja teve o maior público?', 'Quem foi o primeiro presidente da Fenasoja?', 'Quando foi a 10ª edição do Musicanto?', 'Quanto tem o Plano Safra 2025/26?']) expect(interpretKbQuery(text, now).editionYear).toBeUndefined();
    expect(interpretKbQuery('Quanto tem o Plano Safra 2025/26?', now).referencePeriod).toBe('2025/2026');
  });
  it('does not confirm partial numbering or contradict a provided year', () => {
    expect(interpretKbQuery('Quem presidiu a 10ª Fenasoja em 2024?', now).clarification).toBeTruthy();
    expect(interpretKbQuery('Quando será a 26ª Fenasoja?', now).clarification).toBeTruthy();
  });
  it('keeps explicit regional years and requested attributes independent from editions', () => {
    expect(interpretKbQuery('Qual é a população de Santa Rosa em 1990?', now)).toMatchObject({ referenceYear: 1990, attribute: 'population', temporalMode: 'explicit' });
    expect(interpretKbQuery('Quantos habitantes tem Alegria em 2025?', now).entityName).toBe('alegria');
    expect(interpretKbQuery('Qual o PIB do Rio Grande do Sul em 2022?', now)).toMatchObject({ referenceYear: 2022, attribute: 'gdp' });
    expect(interpretKbQuery('Quanto tem o Plano Safra da Agricultura Familiar em 2024?', now).clarification).toContain('ciclo');
    expect(interpretKbQuery('Quem foi a primeira mulher presidente da Fenasoja?', now)).toMatchObject({ comparative: true, attribute: 'female_president' });
    expect(interpretKbQuery('Quem foi a primeira mulher presidente da Fenasoja?', now).editionYear).toBeUndefined();
    expect(interpretKbQuery('Quem será o presidente da Fenasoja seguinte à de 2026?', now).notes.join(' ')).toContain('edição de 2028');
    expect(interpretKbQuery('Quem será o presidente da Fenasoja seguinte à de 2030?', now).clarification).toBeTruthy();
  });
  it('uses inclusive civil dates and never recycles the last known future edition', () => {
    expect(interpretKbQuery('Qual é a Fenasoja atual?', new Date('2028-04-28T03:00:00Z'))).toMatchObject({ editionYear: 2028, today: '2028-04-28' });
    expect(interpretKbQuery('Qual é a Fenasoja atual?', new Date('2028-05-08T02:59:59Z')).editionYear).toBe(2028);
    expect(interpretKbQuery('Quando é a próxima Fenasoja?', new Date('2028-05-08T03:00:00Z')).unresolvedEdition).toBe(true);
  });
  it('resolves conflicting openings only after all recorded possibilities, and keeps origins historical', () => {
    expect(interpretKbQuery('Qual é a Fenasoja atual?', new Date('2024-11-28T15:00:00Z')).clarification).toBeTruthy();
    expect(interpretKbQuery('Qual é a Fenasoja atual?', new Date('2024-12-01T15:00:00Z')).editionYear).toBe(2024);
    for (const text of ['Quando foi criada a Fenasoja?', 'Por que a Fenasoja deixou de usar o número da edição na marca?']) {
      expect(interpretKbQuery(text, now).editionYear).toBeUndefined();
      expect(interpretKbQuery(text, now).notes).toEqual([]);
    }
    expect(interpretKbQuery('Quem preside a Fenasoja?', now)).toMatchObject({ role: 'president', editionYear: 2028 });
    expect(interpretKbQuery('Quanto tem o Plano Safra 1999/00?', now).referencePeriod).toBe('1999/2000');
  });
  it('asks before answering a compound request or multiple editions', () => {
    for (const text of ['Quem foi presidente em 2024 e 2026 na Fenasoja?', 'Qual o preço da soja e do milho hoje?', 'Quem preside a Fenasoja e quando ela ocorre?', 'Quem presidiu a 10ª e a 11ª edição?', 'Quem presidiu a décima e a décima primeira Fenasoja?']) expect(interpretKbQuery(text, now).clarification).toBeTruthy();
  });
  it('asks for a missing municipality and an inconsistent past/future reference', () => {
    expect(interpretKbQuery('Quantos habitantes?', now).clarification).toBeTruthy();
    expect(interpretKbQuery('Quem é o prefeito?', now).clarification).toBeTruthy();
    expect(interpretKbQuery('Quem é o prefeito Porto Alegre?', now).entityName).toBe('porto alegre');
    expect(interpretKbQuery('Quando ocorreu a próxima Fenasoja?', now).clarification).toBeTruthy();
  });
  it('preserves internal questions and invalid query limits', async () => {
    const rpc = vi.fn();
    for (const text of ['Quantos lotes vendemos em 2026?', 'Quais eventos tenho amanhã na agenda?', '?', ' '.repeat(50), 'Qual '.repeat(130), '2028', 'Refiro-me à Fenasoja 2028', 'início da gestação']) {
      expect(await searchKnowledgeBase(rpc, text, now)).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('public KB: selection policy and exact reviewed composition', () => {
  it('preserves both complete source corpora and every question occurrence', () => {
    expect(entries).toHaveLength(2786);
    expect(entries.reduce((total, item) => total + 1 + item.variants.length, 0)).toBe(12134);
    expect(new Set(entries.map(item => item.id)).size).toBe(2786);
  });
  it('uses initial thresholds with an explicit expanded-base exception', () => {
    const query = interpretKbQuery('Onde fica Santa Rosa?', now);
    const f = hit('SR-001', 0.6), e = { ...hit('RS-WK-0041', 0.69), query_policy: {} };
    expect(selectKbHit([f, e], query, now)).toMatchObject({ hit: { kb: 'fenasoja' } });
    expect(selectKbHit([f, { ...e, score: 0.71 }], query, now)).toMatchObject({ hit: { kb: 'expandida' } });
    expect(selectKbHit([{ ...f, score: KB_THRESHOLDS.fenasoja - 0.001 }], query, now)).toBeNull();
    expect(selectKbHit([{ ...e, score: KB_THRESHOLDS.expandida - 0.001 }], query, now)).toBeNull();
    expect(selectKbHit([f, { ...e, score: 0.61 }], query, now)?.type).toBe('clarification');
  });
  it('never suppresses the eighth-edition conflict or selects a homonymous vice presidency', () => {
    expect(selectKbHit([hit('ED08-PRES'), hit('HIS-013', 0.8)], interpretKbQuery('Quem presidiu a oitava Fenasoja?', now), now)).toMatchObject({ hit: { entry_id: 'HIS-013', status: 'conflito' } });
    expect(selectKbHit([hit('ED25-VICE'), hit('F26-014')], interpretKbQuery('Quem foi o vice-presidente da Fenasoja 2026?', now), now)).toMatchObject({ hit: { entry_id: 'ED25-VICE' } });
  });
  it('clarifies meaningful ties without selecting or logging an arbitrary entry', () => {
    const selected = selectKbHit([hit('AGRO-OVI-0181'), hit('AGRO-OVI-0182')], interpretKbQuery('Qual a altura de pastejo para ovelhas?', now), now)!;
    expect(selected).toMatchObject({ type: 'clarification', outcome: 'clarification' });
    expect(selected).not.toHaveProperty('hit');
    const response = decodeWorkerResponse(composeKbResponse(request, selected, now).content)!;
    expect(response.summary).toContain('gestação'); expect(response.summary).not.toBe(hit('AGRO-OVI-0181').answer);
  });
  it('keeps the highest duplicate score and never truncates long clarification options', () => {
    const query = interpretKbQuery('Onde fica Santa Rosa?', now);
    expect(selectKbHit([hit('SR-001', 0.8), hit('SR-001', 0.3)], query, now)).toMatchObject({ hit: { score: 0.8 } });
    const selected = selectKbHit([{ ...hit('SR-001', 0.8), canonical_question: 'Pergunta completa '.repeat(14) }, { ...hit('RS-WK-0041', 0.8), kb: 'fenasoja', query_policy: {} }], query, now)!;
    expect(selected.type).toBe('clarification');
    expect(selected).not.toHaveProperty('options');
    expect(decodeWorkerResponse(composeKbResponse(request, selected, now).content)?.summary).toContain('respostas diferentes');
  });
  it('rejects historical Pronaf for current intent and another edition before scoring', () => {
    expect(selectKbHit([hit('MERC-PS-005')], interpretKbQuery('Quanto tem o Pronaf esse ano?', now), now)).toBeNull();
    expect(selectKbHit([hit('F26-005')], interpretKbQuery('Onde comprar ingresso para os shows da Fenasoja?', now), now)).toBeNull();
    expect(selectKbHit([hit('F28-002')], interpretKbQuery('Quem presidiu a Fenasoja 1994?', now), now)).toBeNull();
  });
  it('rejects another reference year or an unrelated attribute even at a perfect score', () => {
    expect(selectKbHit([hit('SR-002')], interpretKbQuery('Qual é a população de Santa Rosa em 1990?', now), now)).toBeNull();
    expect(selectKbHit([hit('RS-WK-0001')], interpretKbQuery('Qual o PIB do Rio Grande do Sul em 2022?', now), now)).toBeNull();
    expect(selectKbHit([hit('RS-WK-0001')], interpretKbQuery('Qual o PIB do Rio Grande do Sul?', now), now)).toBeNull();
    expect(selectKbHit([hit('SR-002')], interpretKbQuery('Qual é a população de Santa Rosa em 2025?', now), now)).toMatchObject({ hit: { entry_id: 'SR-002' } });
    expect(selectKbHit([hit('SR-002')], interpretKbQuery('Quantos habitantes tem Alegria em 2025?', now), now)).toBeNull();
    expect(selectKbHit([hit('RS-IBGE-POP-4300455')], interpretKbQuery('Quantos habitantes tem Alegria em 2022?', now), now)).toMatchObject({ hit: { entry_id: 'RS-IBGE-POP-4300455' } });
    expect(selectKbHit([hit('ED25-PRES'), hit('HIS-009', 0.8)], interpretKbQuery('Quem foi a primeira mulher presidente da Fenasoja?', now), now)).toMatchObject({ hit: { entry_id: 'HIS-009' } });
  });
  it('does not invert an unmatched negation but permits an exact reviewed negative question', () => {
    const query = interpretKbQuery('Quem não foi o presidente da Fenasoja 2024?', now);
    expect(selectKbHit([hit('ED24-PRES')], query, now)).toMatchObject({ type: 'clarification', outcome: 'clarification' });
    const absent = hit('GER-006');
    const negative = absent.canonical_question;
    expect(negative).toBeTruthy();
    expect(selectKbHit([{ ...absent, matched_question: negative }], interpretKbQuery(negative, now), now)).toMatchObject({ type: 'answer', hit: { entry_id: 'GER-006' } });
  });
  it('validates every reviewed display string, all statuses and literal summaries without truncation', () => {
    for (const entry of entries) {
      const candidate = hit(entry.id);
      const selection: KbSelection = { type: 'answer', hit: candidate, query: interpretKbQuery(entry.canonical_question, now), notes: [],
        outcome: entry.status === 'confirmado' ? 'answered' : entry.status === 'sem_fonte' ? 'not_confirmed' : entry.status === 'dinamico' ? 'redirected_live' : 'answered_with_caveat' };
      const composed = composeKbResponse(request, selection, now);
      const response = decodeWorkerResponse(composed.content)!;
      expect(response, entry.id).not.toBeNull();
      expect(response.summary, entry.id).toBe(entry.answer);
      expect(redactWorkerText(entry.answer), entry.id).toBe(entry.answer);
      expect(response.worker).toBe('mapa');
      expect(validateWorkerResponseCitations(response, composed.citations)).toEqual(composed.citations);
      if (entry.status === 'sem_fonte') { expect(composed.citations).toEqual([]); expect(response.metadata.completeness).toBe('unavailable'); }
      else expect(kbCitations(candidate).length).toBeGreaterThan(0);
    }
  }, 60000);
});
