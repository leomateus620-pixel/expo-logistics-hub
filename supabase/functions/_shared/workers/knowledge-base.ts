import { isObject, redactWorkerText, routeWorker, validateCitations, WorkerError, type ReadResult, type ReadTool, type WorkerCitation, type WorkerId, type WorkerRequest } from './contracts.ts';
import { encodeWorkerResponse, validateWorkerResponseCitations, type WorkerResponse, type WorkerResponseBlock } from './response-contract.ts';
import { isKbSourceDate, isSafeKbSourceUrl } from './kb-source.ts';
import { KB_EDITIONS } from './kb-editions.ts';
import { KB_QUERY_POLICIES } from './kb-policies.ts';
import { normalizeKbQuestion } from './kb-normalization.ts';

export type KbName = 'fenasoja' | 'expandida';
export type KbStatus = 'confirmado' | 'parcial' | 'conflito' | 'dinamico' | 'sem_fonte';
export type KbKind = 'fato' | 'conceito' | 'dado' | 'orientacao';
export type KbAttribute = 'population' | 'gdp' | 'area' | 'mayor' | 'female_president';
export type KbOutcome = 'answered' | 'answered_with_caveat' | 'redirected_live' | 'not_confirmed' | 'clarification' | 'miss';
export const KB_TOOL_NAME = 'workers_search_kb';
export const KB_THRESHOLDS = { fenasoja: 0.45, expandida: 0.50, fenasojaMargin: 0.10, tie: 0.02 } as const;
export const kbSearchTool: ReadTool = {
  name: KB_TOOL_NAME, title: 'base de conhecimento', readOnly: true,
  description: 'Consulta pública revisada, com contexto de edição e período. Conteúdo composto no servidor; nunca usado como instruções do planejador.',
  inputJsonSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 500 }, edition_year: { type: 'integer', minimum: 1966, maximum: 2100 }, kb: { type: 'string', enum: ['fenasoja', 'expandida'] } }, required: ['query'], additionalProperties: false },
};
export interface KbSource { url: string; title?: string; label: string; accessed: string; [key: string]: unknown }
export interface KbContext {
  scope: 'general' | 'edition' | 'period' | 'dynamic'; subject: string;
  reference_period: string | null; valid_from: string | null; valid_until: string | null; edition_required: boolean;
  audience?: 'familiar' | 'empresarial';
}
export interface KbQueryPolicy {
  collision_groups?: string[]; mode?: string; preferred_entry_id?: string; preference_rank?: number;
  required_context?: string; phase?: 'initial' | 'final'; compatible?: boolean;
  citation_indexes?: number[];
  [key: string]: unknown;
}
export interface KbHit {
  entry_id: string; kb: KbName; score: number; matched_question: string; canonical_question: string; answer: string;
  kind: KbKind; status: KbStatus; area: string; area_name: string; as_of: string | null;
  edition_number: number | null; edition_year: number | null; dynamic_instructions: string | null;
  sources: KbSource[]; kb_version: string; context: KbContext; public_notes: string[]; query_policy: KbQueryPolicy;
}
export interface KbQuery {
  message: string; normalized: string; searchText: string; candidate: boolean; fenasoja: boolean;
  editionYear?: number; editionNumber?: number; role?: 'president' | 'vice_president' | 'honorary_president';
  subject?: string; audience?: 'familiar' | 'empresarial'; referencePeriod?: string; referenceYear?: number; attribute?: KbAttribute; entityName?: string; gestationPhase?: 'initial' | 'final';
  temporalMode: 'explicit' | 'current' | 'historical' | 'none'; today: string;
  notes: string[]; clarification?: string; unresolvedEdition: boolean; comparative: boolean; negated?: boolean;
}
export type KbSelection = { type: 'answer'; hit: KbHit; query: KbQuery; notes: string[]; outcome: Exclude<KbOutcome, 'clarification' | 'miss'> }
  | { type: 'clarification'; question: string; options?: string[]; query: KbQuery; outcome: 'clarification' };
export type KbRpc = (name: typeof KB_TOOL_NAME, args: Record<string, unknown>) => Promise<unknown>;
interface Edition { year: number; number: number | null; start: string | null; end: string | null; start_candidates?: readonly string[]; number_confirmed: boolean; date_conflict: boolean }
const editions: readonly Edition[] = KB_EDITIONS;
const civilFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const fold = (text: string) => text.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// An entity name alone cannot establish coverage of the requested fact. Keep
// these attribute checks equivalent to the SQL filters applied before its cut.
const attributePatterns: Record<KbAttribute, RegExp> = {
  population: /\b(?:populacao|habitantes)\b/,
  gdp: /\b(?:pib|produto interno bruto)\b/,
  area: /\b(?:area|superficie|extensao territorial)\b/,
  mayor: /prefeit/,
  female_president: /(?:mulher|feminina)/,
};
function requestedAttribute(text: string): KbAttribute | undefined {
  if (/mulher|feminina/.test(text) && /presid/.test(text)) return 'female_president';
  for (const key of ['population', 'gdp', 'area', 'mayor'] as const) if (attributePatterns[key].test(text)) return key;
  return undefined;
}
function namedPopulationEntity(text: string): string | undefined {
  const normalized = normalizeKbQuestion(text);
  const entity = /\b(?:habitantes(?: tem| ha em| existem em)?|populacao(?: atual| estimada)?(?: d[aoe])?|prefeit[oa](?: d[aoe])?) (.+)$/.exec(normalized)?.[1];
  return entity?.replace(/\s+(?:(?:em|no ano de|no censo de|de)\s+)?(?:18\d{2}|19\d{2}|20\d{2}|2100)$/, '')
    .replace(/\s+(?:hoje|atualmente)$/, '').replace(/\s+(?:rs|no rio grande do sul)$/, '').replace(/^(?:municipio|cidade) de /, '').trim() || undefined;
}
const ordinalUnits = ['primeir', 'segund', 'terceir', 'quart', 'quint', 'sext', 'setim', 'oitav', 'non'];
const ordinalTens = ['decim', 'vigesim', 'trigesim'];
/** Compound ordinals are consumed as a whole, before their component words. */
function readOrdinal(text: string): { number: number; raw: string } | undefined {
  const numeric = /\b(\d{1,2})(?:[ao]\b|\s*(?:edicao|fenasoja)\b)/.exec(text) ?? /\bedicao\s+(\d{1,2})\b/.exec(text);
  if (numeric) return { number: Number(numeric[1]), raw: numeric[0] };
  for (let t = ordinalTens.length - 1; t >= 0; t--) {
    const compound = new RegExp(`\\b${ordinalTens[t]}[ao](?:\\s+(${ordinalUnits.join('|')})[ao])?\\b`).exec(text);
    if (compound) return { number: (t + 1) * 10 + (compound[1] ? ordinalUnits.indexOf(compound[1]) + 1 : 0), raw: compound[0] };
  }
  const unit = new RegExp(`\\b(${ordinalUnits.join('|')})[ao]\\s+(?:edicao|fenasoja)\\b`).exec(text);
  return unit ? { number: ordinalUnits.indexOf(unit[1]) + 1, raw: unit[0] } : undefined;
}
export function kbCivilDate(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new WorkerError('invalid_kb_clock', 500);
  const parts = Object.fromEntries(civilFormatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
/** Explicit internal nouns retain app-tool precedence regardless of selected bot. */
export function isPublicKbQuestion(message: string): boolean {
  const text = fold(message);
  if (message.length < 2 || message.length > 500 || !/[a-z0-9]/.test(text)) return false;
  const fragment = normalizeKbQuestion(message);
  // A context-only reply belongs to the existing conversation-aware fallback;
  // searching it alone could mistake a year or phase for a complete question.
  if (/^(?:(?:refiro me a|estou falando da|e sobre a) )?(?:fenasoja )?(?:edicao )?(?:19\d{2}|20\d{2}|2100)$/.test(fragment)
    || /^(?:(?:no|e no|as ovelhas estao no) )?(?:inicio|final|fim) da gestacao$/.test(fragment)) return false;
  if (/\b(lotes?|vendemos|vendas?|clientes?|compradores?|contratos?|pedidos?|orcamento|despesas?|recebimentos?|checklist|notificacoes|minha organizacao|nossa organizacao)\b/.test(text)) return false;
  if (/\b(agenda|cronograma|meus?|minhas?|criei|vinculad[oa]s?|responsavel|responsaveis|pendencias?|reunioes|reuniao)\b/.test(text)
    || /\b(eventos?|comissoes|frota|veiculos|transportes|carrinhos|patinetes|escalas)\b/.test(text) && !/fenasoja|musicanto|feira|conceito|o que/.test(text)) return false;
  return true;
}
function editionLabel(edition: Edition): string {
  return edition.number_confirmed && edition.number ? `${edition.number}ª edição, de ${edition.year}` : `edição de ${edition.year}`;
}
export function interpretKbQuery(message: string, now: Date): KbQuery {
  const text = fold(message), today = kbCivilDate(now);
  const ordinal = readOrdinal(text);
  const namedOtherFair = /expointer|expodireto|musicanto|agrobras[ií]lia|agrishow|show rural|expolondrina/.test(text);
  const fenasoja = /fenasoja|feira nacional da soja/.test(text) || Boolean(!namedOtherFair && /edicao/.test(text) && (ordinal || /\b(?:19|20)\d{2}\b|anterior|proxima|atual|passada/.test(text)));
  const query: KbQuery = { message, normalized: normalizeKbQuestion(message), searchText: message,
    candidate: isPublicKbQuestion(message), fenasoja, today, temporalMode: 'none', notes: [], unresolvedEdition: false,
    comparative: /maior|menor|mais longa|recorde|todas|todos|primeir[oa] presidente|historia|historico|ao longo/.test(text) };
  if (!query.candidate) return query;
  query.negated = /\b(?:nao|nunca|jamais)\b/.test(text);
  query.attribute = requestedAttribute(text);
  if (query.attribute === 'population' || query.attribute === 'mayor') query.entityName = namedPopulationEntity(text);
  if ((query.attribute === 'population' || query.attribute === 'mayor') && !query.entityName) {
    query.clarification = query.attribute === 'mayor' ? 'De qual município você deseja saber a prefeitura?' : 'De qual local ou população você deseja saber a quantidade de habitantes?';
    return query;
  }
  if (query.attribute === 'female_president') query.comparative = true;
  if (/\b(?:soja|milho|trigo|arroz|leite|boi)\s+e\s+(?:d[oa]\s+)?(?:soja|milho|trigo|arroz|leite|boi)\b/.test(text)
    || /\?[^?]+\?/.test(text) || /\be\s+(?:qual|quanto|quando|quem|onde|como)\b/.test(text)) {
    query.clarification = 'Qual assunto você deseja consultar primeiro? Posso responder um fato por vez com as fontes correspondentes.';
    return query;
  }
  if (/presidente(?:\s+da\s+fenasoja)?\s+de\s+honra/.test(text)) query.role = 'honorary_president';
  else if (/vice[ -]presid/.test(text)) query.role = 'vice_president';
  else if (/presidente|presidencia|presidiu|presidia|presidira|\bpreside\b|presidindo/.test(text)) query.role = 'president';
  const crop = /\b((?:19|20)\d{2})\s*\/\s*((?:19|20)?\d{2})\b/.exec(text);
  if (crop) query.referencePeriod = `${crop[1]}/${crop[2].length === 2 ? crop[1].endsWith('99') && crop[2] === '00' ? String(Number(crop[1]) + 1) : crop[1].slice(0, 2) + crop[2] : crop[2]}`;
  if (/plano safra|pronaf/.test(text)) { query.subject = 'plano_safra'; query.audience = /agricultura familiar|pronaf/.test(text) ? 'familiar' : 'empresarial'; }
  if (/gestacao|ovelhas|ovinos/.test(text) && /pastejo|pasto|altura/.test(text)) {
    if (/inicio|inicial|primeir/.test(text)) query.gestationPhase = 'initial';
    else if (/fim|final|ultim/.test(text)) query.gestationPhase = 'final';
    else if (/altura/.test(text)) query.clarification = 'Você quer a altura de pastejo no início ou no final da gestação das ovelhas?';
  }
  const current = /\b(hoje|atual|atuais|vigente|agora|esse ano|este ano|neste ano|desse ano|deste ano|desta|proxima|que vem|seguinte)\b/.test(text);
  if (!fenasoja) {
    const referenceYears = [...new Set(text.match(/\b(?:18\d{2}|19\d{2}|20\d{2}|2100)\b/g) ?? [])].map(Number);
    if (!query.referencePeriod && referenceYears.length) {
      if (query.subject === 'plano_safra') {
        query.clarification = 'Qual ciclo do Plano Safra você deseja consultar? Informe os dois anos, por exemplo 2025/2026, e se é agricultura familiar ou empresarial.';
      } else if (referenceYears.length > 1) {
        query.clarification = 'Qual ano de referência você deseja consultar primeiro? Posso responder um período por vez com as fontes correspondentes.';
      } else query.referenceYear = referenceYears[0];
    }
    query.temporalMode = query.referencePeriod || query.referenceYear ? 'explicit' : current ? 'current' : 'none';
    return query;
  }
  query.subject = 'fenasoja';
  const mentionedOrdinals = new Set<number>();
  let remainingOrdinals = text;
  for (let index = 0; index < 20; index++) {
    const mentioned = readOrdinal(remainingOrdinals);
    if (!mentioned) break;
    mentionedOrdinals.add(mentioned.number);
    remainingOrdinals = remainingOrdinals.replace(mentioned.raw, ' ');
  }
  if (mentionedOrdinals.size > 1) {
    query.clarification = 'Qual edição você deseja consultar primeiro? Posso responder uma edição por vez com as fontes correspondentes.';
    return query;
  }
  const years = [...new Set(text.match(/\b(?:19\d{2}|20\d{2}|2100)\b/g) ?? [])].map(Number);
  const factKinds = [/presidente|presidiu|presidencia/, /vice[ -]presid/, /publico|visitantes/, /negocios|movimentou/, /quando|datas/, /ingressos/, /estacionamento/].filter(pattern => pattern.test(text.replace(/vice[ -]presid\w*/g, 'vicecargo'))).length;
  if (years.length > 1 || factKinds > 1 || /presidente\s+e\s+(?:o\s+)?vice/.test(text)) {
    query.clarification = 'Qual assunto e qual edição você deseja consultar primeiro? Posso responder um fato por vez com as fontes correspondentes.';
    return query;
  }
  const explicitYear = years[0];
  if (query.attribute === 'female_president' && explicitYear) {
    query.clarification = 'Você deseja consultar a primeira mulher a presidir a Fenasoja ou a presidência da edição informada?';
    return query;
  }
  const ordinalEdition = ordinal && editions.find(edition => edition.number === ordinal.number);
  if (ordinal) {
    query.editionNumber = ordinal.number;
    if (!ordinalEdition || explicitYear && explicitYear !== ordinalEdition.year) {
      query.clarification = explicitYear ? 'O número da edição e o ano informados não correspondem no calendário consultado. Qual deles você deseja usar?' : 'Não tenho uma correspondência confirmada para esse número de edição. Qual é o ano da Fenasoja?';
      return query;
    }
    if (!ordinalEdition.number_confirmed) {
      query.clarification = `A numeração dessa edição não está confirmada no calendário consultado. Você deseja consultar a Fenasoja de ${ordinalEdition.year}?`;
      return query;
    }
    query.notes.push(`Interpretei a ${ordinal.number}ª Fenasoja como a edição de ${ordinalEdition.year}.`);
  }
  if (explicitYear || ordinalEdition) {
    query.editionYear = explicitYear ?? ordinalEdition!.year;
    query.temporalMode = 'explicit';
    if (/anterior (?:a|ao|a edicao)|antes (?:da|de)/.test(text)) {
      const earlier = editions.filter(edition => edition.year < query.editionYear!).sort((a, b) => b.year - a.year)[0];
      if (earlier) { query.notes.push(`Considerei a edição anterior à de ${query.editionYear}: ${editionLabel(earlier)}.`); query.editionYear = earlier.year; }
      else query.clarification = 'Não consegui resolver a edição anterior nessa referência. Informe o ano que deseja consultar.';
    } else if (/seguinte (?:a|ao)|posterior (?:a|ao)|depois (?:da|de)/.test(text)) {
      const following = editions.filter(edition => edition.year > query.editionYear!).sort((a, b) => a.year - b.year)[0];
      if (following) { query.notes.push(`Considerei a edição seguinte à de ${query.editionYear}: ${editionLabel(following)}.`); query.editionYear = following.year; }
      else query.clarification = 'Não consegui resolver a edição seguinte nessa referência. Informe o ano que deseja consultar.';
    }
  } else if (!query.comparative && !/o que e|onde fica|significa|surgiu|origem|fundad|criad|criou|nasceu|deixou|localiza|como chegar/.test(text)) {
    const last = editions.filter(edition => edition.end && edition.end < today).sort((a, b) => b.end!.localeCompare(a.end!))[0];
    const starts = (edition: Edition) => edition.start ? [edition.start] : [...(edition.start_candidates ?? [])].sort();
    // Conflicting openings are an interval of uncertainty, never an invented date.
    const running = editions.find(edition => { const dates = starts(edition); return dates.length && edition.end && dates.every(date => date <= today) && today <= edition.end; });
    const uncertain = editions.find(edition => { const dates = starts(edition); return dates.length > 1 && dates.some(date => date <= today) && dates.some(date => date > today) && edition.end && today <= edition.end; });
    const next = editions.filter(edition => { const dates = starts(edition); return dates.length && dates.every(date => date > today); }).sort((a, b) => starts(a)[0].localeCompare(starts(b)[0]))[0];
    const previous = /ultima|mais recente|passada|anterior|\bfoi\b|\bforam\b|\bteve\b|presidiu|presidia|custou|aconteceu|aconteceram|acontecia|ocorreu|ocorreram|ocorria|\bhouve\b|terminou|encerrou/.test(text);
    const upcoming = /proxima|que vem|seguinte/.test(text);
    if (previous && upcoming) {
      query.clarification = 'Você deseja consultar a última edição realizada ou a próxima Fenasoja?';
      return query;
    }
    if (uncertain && !previous) {
      query.clarification = `As fontes divergem sobre a abertura da Fenasoja de ${uncertain.year} nesta data. Você deseja consultar essa edição pelo ano?`;
      return query;
    }
    const chosen = previous ? last : upcoming ? next : running ?? next;
    query.temporalMode = previous ? 'historical' : 'current';
    if (!chosen) query.unresolvedEdition = true;
    else {
      query.editionYear = chosen.year;
      query.notes.push(previous ? `Considerei a última edição realizada: ${editionLabel(chosen)}.`
        : running && chosen === running ? `Considerei a edição em andamento: ${editionLabel(chosen)}.`
          : current ? `Não há edição em andamento nesta data. Considerei a próxima: ${editionLabel(chosen)}.`
            : `Considerei a próxima Fenasoja: ${editionLabel(chosen)}.`);
    }
  }
  // Expansion is for retrieval only; it never rewrites the reviewed answer.
  if (!/fenasoja/.test(text)) query.searchText += ' Fenasoja';
  if (query.editionYear && !years.includes(query.editionYear)) query.searchText += ` ${query.editionYear}`;
  if (query.searchText.length > 500) query.searchText = message;
  return query;
}
function eligible(hit: KbHit, query: KbQuery): boolean {
  if (!Number.isFinite(hit.score) || hit.score < 0 || hit.score > 1) return false;
  const context = hit.context;
  if (query.role && !query.comparative && hit.query_policy.historical_only === true) return false;
  if (query.subject && context.subject !== query.subject) return false;
  if (query.attribute) {
    const canonical = fold(hit.canonical_question);
    if (!attributePatterns[query.attribute].test(canonical) || query.attribute === 'female_president' && !/presid/.test(canonical)) return false;
  }
  if (query.entityName && namedPopulationEntity(hit.canonical_question) !== query.entityName) return false;
  if (query.referenceYear !== undefined && !context.reference_period?.split(/\D+/).includes(String(query.referenceYear))) return false;
  if (query.audience && context.audience && context.audience !== query.audience) return false;
  if (query.editionYear !== undefined && (hit.edition_year !== null && hit.edition_year !== query.editionYear
    || context.edition_required && hit.edition_year !== query.editionYear)) return false;
  if (context.edition_required && query.temporalMode === 'current' && query.editionYear === undefined) return false;
  if (query.comparative && context.scope === 'edition' && hit.query_policy.allow_comparative !== true) return false;
  if (query.role) {
    const canonical = fold(hit.canonical_question);
    if (query.role === 'vice_president' ? !/vice/.test(canonical) : query.role === 'honorary_president' ? !/honra/.test(canonical) : /vice|honra/.test(canonical) || !/presid/.test(canonical)) return false;
  }
  if (query.referencePeriod && context.reference_period !== query.referencePeriod) return false;
  if (query.temporalMode === 'current' && context.scope === 'period' && hit.status !== 'dinamico'
    && (!context.valid_from || !context.valid_until || query.today < context.valid_from || query.today > context.valid_until)) return false;
  if (context.valid_from && query.temporalMode === 'current' && query.today < context.valid_from || context.valid_until && query.temporalMode === 'current' && query.today > context.valid_until) return false;
  if (query.gestationPhase && hit.query_policy.phase && query.gestationPhase !== hit.query_policy.phase) return false;
  return true;
}
function clarification(query: KbQuery, question: string, options?: string[]): KbSelection {
  // Canonical questions may exceed the response contract's 180-character option
  // label. Ask for context without truncating a question into a different one.
  const displayOptions = options?.every(option => option.length <= 180) ? options : undefined;
  return { type: 'clarification', query, question, ...(displayOptions ? { options: displayOptions } : {}), outcome: 'clarification' };
}
const statusOutcome: Record<KbStatus, Exclude<KbOutcome, 'clarification' | 'miss'>> = {
  confirmado: 'answered', parcial: 'answered_with_caveat', conflito: 'answered_with_caveat', dinamico: 'redirected_live', sem_fonte: 'not_confirmed',
};
export function selectKbHit(hits: KbHit[], query: KbQuery, _now: Date): KbSelection | null {
  if (!query.candidate || !query.normalized || query.unresolvedEdition) return null;
  if (query.clarification) return clarification(query, query.clarification);
  if (query.negated) {
    // Trigram similarity barely changes when a negation is added. Only a
    // reviewed question with the exact same normalized wording establishes
    // that polarity here; an unmatched negation needs clarification.
    hits = hits.filter(hit => normalizeKbQuestion(hit.matched_question) === query.normalized);
    if (!hits.length) return clarification(query, 'Pode reformular a pergunta indicando o fato que deseja confirmar e a edição ou período? Preciso esclarecer o sentido da negação para responder com segurança.');
  }
  const collision = KB_QUERY_POLICIES.collisions.find(policy => policy.question_norm === query.normalized);
  if (collision?.action === 'clarify' && 'clarification' in collision && !(query.gestationPhase && collision.entry_ids.some(id => id.startsWith('AGRO-OVI-')))) {
    return clarification(query, collision.clarification);
  }
  const distinct = new Map<string, KbHit>();
  for (const hit of hits.filter(hit => eligible(hit, query)).sort((a, b) => b.score - a.score || a.entry_id.localeCompare(b.entry_id))) {
    if (!distinct.has(hit.entry_id)) distinct.set(hit.entry_id, hit);
  }
  const unique = [...distinct.values()];
  // Explicit editorial priorities win only within their declared collision group.
  const candidates = unique.filter(hit => {
    const preferred = hit.query_policy.preferred_entry_id;
    return !preferred || hit.entry_id === preferred || !unique.some(other => other.entry_id === preferred);
  }).sort((a, b) => b.score - a.score || (a.query_policy.preference_rank ?? 100) - (b.query_policy.preference_rank ?? 100) || a.entry_id.localeCompare(b.entry_id));
  const f = candidates.find(hit => hit.kb === 'fenasoja' && hit.score >= KB_THRESHOLDS.fenasoja);
  const e = candidates.find(hit => hit.kb === 'expandida' && hit.score >= KB_THRESHOLDS.expandida);
  const best = f && !(e && e.score >= f.score + KB_THRESHOLDS.fenasojaMargin) ? f : e;
  if (!best) return null;
  const peers = candidates.filter(hit => hit.entry_id !== best.entry_id && hit.score >= KB_THRESHOLDS[hit.kb] && Math.abs(best.score - hit.score) <= KB_THRESHOLDS.tie);
  if (!query.gestationPhase && (best.query_policy.required_context === 'gestation_phase' || peers.some(hit => hit.query_policy.required_context === 'gestation_phase'))) {
    return clarification(query, 'Você quer a altura de pastejo no início ou no final da gestação das ovelhas?', ['Início da gestação', 'Final da gestação']);
  }
  const ambiguous = peers.filter(hit => hit.answer !== best.answer && !(hit.query_policy.compatible && best.query_policy.compatible)
    && !(best.query_policy.preferred_entry_id === best.entry_id && hit.query_policy.preferred_entry_id === best.entry_id));
  if (ambiguous.length) return clarification(query, 'Encontrei perguntas com respostas diferentes. Qual delas corresponde ao que você quer saber?',
    [best, ...ambiguous].slice(0, 4).map(hit => hit.canonical_question));
  const notes = [...query.notes];
  if (peers.some(hit => hit.query_policy.compatible && best.query_policy.compatible)) notes.push(`Pergunta relacionada na base: ${peers[0].canonical_question}`);
  return { type: 'answer', hit: best, query, notes, outcome: statusOutcome[best.status] };
}
function readHit(value: unknown): KbHit {
  if (!isObject(value) || typeof value.entry_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.entry_id)
    || !['fenasoja', 'expandida'].includes(String(value.kb)) || !['confirmado', 'parcial', 'conflito', 'dinamico', 'sem_fonte'].includes(String(value.status))
    || !['fato', 'conceito', 'dado', 'orientacao'].includes(String(value.kind)) || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 1
    || !isKbSourceDate(value.kb_version) || !Array.isArray(value.sources) || value.sources.length > 8 || !isObject(value.context) || !isObject(value.query_policy)
    || !['general', 'edition', 'period', 'dynamic'].includes(String(value.context.scope)) || typeof value.context.subject !== 'string' || typeof value.context.edition_required !== 'boolean'
    || !Array.isArray(value.public_notes) || value.public_notes.length > 4) throw new WorkerError('invalid_kb_response', 502);
  for (const key of ['answer', 'canonical_question', 'matched_question', 'area', 'area_name']) {
    const field = value[key];
    if (typeof field !== 'string' || !field.trim() || field.length > (key === 'area_name' ? 140 : 1200) || /[<>`]/.test(field)
      || key === 'answer' && redactWorkerText(field) !== field) throw new WorkerError('invalid_kb_response', 502);
  }
  if (value.public_notes.some(note => typeof note !== 'string' || !note.trim() || note.length > 1200 || /[<>`]/.test(note) || redactWorkerText(note) !== note)) throw new WorkerError('invalid_kb_response', 502);
  for (const key of ['valid_from', 'valid_until']) if (value.context[key] !== null && !isKbSourceDate(value.context[key])) throw new WorkerError('invalid_kb_response', 502);
  if (value.edition_year !== null && (!Number.isInteger(value.edition_year) || Number(value.edition_year) < 1966 || Number(value.edition_year) > 2100)
    || value.edition_number !== null && (!Number.isInteger(value.edition_number) || Number(value.edition_number) < 1)
    || value.as_of !== null && (typeof value.as_of !== 'string' || value.as_of.length > 180)
    || value.context.reference_period !== null && typeof value.context.reference_period !== 'string') throw new WorkerError('invalid_kb_response', 502);
  const hit = value as unknown as KbHit;
  if (hit.status !== 'sem_fonte') kbCitations(hit);
  return hit;
}
export async function searchKnowledgeBase(rpc: KbRpc, message: string, now: Date): Promise<KbSelection | null> {
  const query = interpretKbQuery(message, now);
  if (!query.candidate || query.unresolvedEdition) return null;
  if (query.clarification) return clarification(query, query.clarification);
  const data = await rpc(KB_TOOL_NAME, { _query: query.searchText, _edition_year: query.editionYear ?? null, _kb: null, _limit: 3,
    _context: { ...(query.subject ? { subject: query.subject } : {}), ...(query.referencePeriod ? { reference_period: query.referencePeriod } : {}),
      ...(query.role ? { role: query.role } : {}), ...(query.gestationPhase ? { gestation_phase: query.gestationPhase } : {}),
      ...(query.audience ? { audience: query.audience } : {}), comparative: query.comparative,
      ...(query.referenceYear !== undefined ? { reference_year: query.referenceYear } : {}), ...(query.attribute ? { attribute: query.attribute } : {}),
      ...(query.entityName ? { entity_name: query.entityName } : {}),
      as_of: query.today, temporal_mode: query.temporalMode, edition_required: false } });
  if (!Array.isArray(data) || data.length > 6) throw new WorkerError('invalid_kb_response', 502);
  return selectKbHit(data.map(readHit), query, now);
}
/** Citations and the sources block are produced together, from this selected row only. */
export function kbCitations(hit: KbHit): WorkerCitation[] {
  if (hit.status === 'sem_fonte') return [];
  const sources: WorkerCitation[] = [];
  const seen = new Set<string>();
  const selectedSources = hit.query_policy.citation_indexes ? hit.query_policy.citation_indexes.map(index => hit.sources[index]) : hit.sources;
  if (hit.query_policy.citation_indexes && (hit.query_policy.citation_indexes.length > 3 || new Set(hit.query_policy.citation_indexes).size !== hit.query_policy.citation_indexes.length)) throw new WorkerError('invalid_kb_source', 502);
  for (const source of selectedSources) {
    if (!isObject(source) || !isSafeKbSourceUrl(String(source.url)) || !isKbSourceDate(source.accessed)
      || typeof source.label !== 'string' || !source.label.trim() || source.label.length > 160 || /[<>`]/.test(source.label)
      || redactWorkerText(source.label) !== source.label) throw new WorkerError('invalid_kb_source', 502);
    if (!seen.has(source.url)) { sources.push({ label: source.label, url: source.url, source: 'kb', date: source.accessed }); seen.add(source.url); }
  }
  if (!sources.length || hit.status === 'conflito' && sources.length > 3) throw new WorkerError('invalid_kb_source', 502);
  return validateCitations(sources.slice(0, 3));
}
const statusNote: Partial<Record<KbStatus, string>> = {
  parcial: 'Informação parcial: a fonte sustenta a resposta só em parte. Confira a fonte antes de usar como dado oficial.',
  conflito: 'As fontes consultadas divergem neste ponto. Confira as fontes antes de usar o dado como oficial.',
  dinamico: 'Este dado muda com frequência e não fica fixo na base. Consulte a fonte indicada para o valor atualizado, com data e hora.',
};
export function composeKbResponse(request: WorkerRequest, selection: KbSelection, now: Date, worker: WorkerId = routeWorker(request)): { content: string; citations: WorkerCitation[] } {
  const blocks: WorkerResponseBlock[] = [], citations = selection.type === 'answer' ? kbCitations(selection.hit) : [];
  const response: WorkerResponse = { version: 1, intent: 'knowledge_base', worker,
    summary: selection.type === 'answer' ? selection.hit.answer : selection.question,
    metadata: { organizationId: request.orgId, timezone: 'America/Sao_Paulo', updatedAt: now.toISOString(),
      scope: selection.type === 'answer' && selection.hit.kb === 'expandida' ? `Base de conhecimento pública · ${selection.hit.area_name}` : 'Base de conhecimento pública da Fenasoja',
      completeness: selection.type === 'answer' ? selection.hit.status === 'confirmado' ? 'complete' : selection.hit.status === 'sem_fonte' ? 'unavailable' : 'partial' : 'partial', notes: [] }, blocks };
  if (selection.type === 'clarification') blocks.push({ type: 'clarification', question: selection.question, ...(selection.options ? { options: selection.options } : {}) });
  else {
    const { hit } = selection;
    response.metadata.notes = [...selection.notes, ...hit.public_notes];
    if (statusNote[hit.status]) response.metadata.notes.push(statusNote[hit.status]!);
    if (hit.kind === 'dado' && hit.as_of && !['s.d.', 's.d', 'null'].includes(hit.as_of.toLowerCase())) response.metadata.notes.push(`Dado de referência: ${isKbSourceDate(hit.as_of) ? hit.as_of.split('-').reverse().join('/') : hit.as_of}`);
    if (hit.edition_year) {
      const edition = editions.find(item => item.year === hit.edition_year);
      response.metadata.edition = edition?.number_confirmed && edition.number ? `${edition.number}ª Fenasoja · ${edition.year}` : `Fenasoja ${hit.edition_year}`;
    }
    if (hit.status === 'sem_fonte') blocks.push({ type: 'empty', message: 'Esta informação não está confirmada nas fontes oficiais consultadas.' });
    if (citations.length) blocks.push({ type: 'sources', items: citations });
  }
  return { content: encodeWorkerResponse(response), citations: validateWorkerResponseCitations(response, citations) };
}
export function kbReadResult(selection: KbSelection | null): ReadResult {
  if (!selection) return { summary: 'Sem correspondência elegível na base pública.', records: [], citations: [], total: 0 };
  if (selection.type === 'clarification') return { summary: selection.question, records: [], citations: [], total: 0 };
  return { summary: selection.hit.answer, records: selection.hit.status === 'sem_fonte' ? [] : [{ entry_id: selection.hit.entry_id, kb: selection.hit.kb, kb_version: selection.hit.kb_version }], citations: kbCitations(selection.hit), total: selection.hit.status === 'sem_fonte' ? 0 : 1 };
}
