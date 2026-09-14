import type { CronogramaCategory, CronogramaKind } from '@/components/cronograma-eventos/types';
import { normalizeLegacyCategory } from './taxonomy';

export type ClassificationSignal =
  | 'title'
  | 'summary'
  | 'description'
  | 'commission'
  | 'participants'
  | 'owner'
  | 'location'
  | 'governance-rule'
  | 'fallback'
  | 'ai';

export interface ClassificationResult<T extends string> {
  value: T;
  confidence: number;
  source: ClassificationSignal[];
}

export interface EventClassificationInput {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  /** Commission/assessoria names or slugs linked to the event. */
  commissions?: Array<string | null | undefined>;
  /** Names of the people linked to the event. */
  people?: Array<string | null | undefined>;
  owner?: string | null;
  location?: string | null;
}

export interface EventClassification {
  category: ClassificationResult<CronogramaCategory>;
  kind: ClassificationResult<CronogramaKind>;
}

/** Lowercase, accent-free, single-spaced text used by every rule. */
export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- type rules

/** Prefix rules express the main intent of the sentence and short-circuit scoring. */
const KIND_PREFIX_RULES: Array<[CronogramaKind, RegExp]> = [
  ['milestone', /^(marco|hito)\b/],
  ['meeting', /^(reuniao|reunioes|encontro|assembleia|comite|alinhamento|meeting|mesa redonda|workshop de alinhamento)\b/],
  ['deadline', /^(prazo|data limite|deadline|entrega ate|vencimento|encerramento das inscricoes|ultimo dia)\b/],
  ['decision', /^(decisao|deliberacao|aprovacao|votacao|homologacao)\b/],
  ['event', /^(evento|cerimonia|solenidade|abertura|coletiva|visita|lancamento oficial de|show|apresentacao)\b/],
];

interface KindSignalRule {
  kind: CronogramaKind;
  pattern: RegExp;
  weight: number;
}

const KIND_SIGNALS: KindSignalRule[] = [
  { kind: 'meeting', pattern: /\b(reuniao|reunioes|encontro|alinhamento|assembleia|comite|conselho|mesa de trabalho|briefing)\b/, weight: 2.0 },
  { kind: 'deadline', pattern: /\b(prazo|data limite|deadline|vencimento|ate o dia|entrega ate|encerramento das inscricoes|limite para)\b/, weight: 2.0 },
  { kind: 'decision', pattern: /\b(decisao|deliberacao|delibera|aprovacao do|aprovado|homologacao|votacao|autorizacao formal)\b/, weight: 1.8 },
  { kind: 'decision', pattern: /\b(define|definir|definicao)\b/, weight: 1.4 },
  { kind: 'milestone', pattern: /\b(conclusao|concluida|concluido|finalizacao de etapa|entrega oficial|abertura oficial|inicio oficial|implantacao concluida|encerramento de etapa|marco)\b/, weight: 2.2 },
  { kind: 'milestone', pattern: /\b(lancamento oficial|abertura de vendas|publicacao oficial)\b/, weight: 1.5 },
  { kind: 'event', pattern: /\b(evento|cerimonia|solenidade|coletiva|visita|show|apresentacao|treinamento|recepcao|jantar|almoco|feira|campanha|producao|inauguracao)\b/, weight: 1.6 },
];

function headOf(text: string): string {
  const connector = text.search(/\b(para|sobre|visando|a fim de|com o objetivo|referente)\b/);
  if (connector > 6) return text.slice(0, connector);
  return text;
}

function classifyKind(text: string): ClassificationResult<CronogramaKind> {
  if (!text) return { value: 'event', confidence: 0.2, source: ['fallback'] };

  const prefix = KIND_PREFIX_RULES.find(([, pattern]) => pattern.test(text));
  if (prefix) return { value: prefix[0], confidence: 0.96, source: ['title'] };

  const head = headOf(text);
  const scores = new Map<CronogramaKind, number>();
  for (const rule of KIND_SIGNALS) {
    if (!rule.pattern.test(text)) continue;
    const positional = rule.pattern.test(head) ? 1 : 0.45;
    scores.set(rule.kind, (scores.get(rule.kind) ?? 0) + rule.weight * positional);
  }
  scores.set('event', (scores.get('event') ?? 0) + 0.6);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const total = bestScore + runnerUp || 1;
  const confidence = Math.min(0.95, Math.max(0.3, bestScore / total));
  return { value: best, confidence, source: bestScore > 0.6 ? ['title'] : ['fallback'] };
}

// ------------------------------------------------------------ category rules

interface CategorySignalRule {
  category: CronogramaCategory;
  pattern: RegExp;
  weight: number;
}

const CATEGORY_SIGNALS: CategorySignalRule[] = [
  // Comercial e patrocínios
  { category: 'comercial', pattern: /\b(patrocin\w*|cota|cotas|espaco comercial|comercializacao|estande|stand|expositor\w*|venda de espacos|contrato comercial|parceiro comercial)\b/, weight: 2.6 },
  // Comunicação e marketing
  { category: 'comunicacao', pattern: /\b(imprensa|coletiva|entrevista|midia|marketing|campanha|divulgacao|publicidade|assessoria de comunicacao|redes sociais|site oficial|revista)\b/, weight: 2.6 },
  // Programação e eventos
  { category: 'programacao', pattern: /\b(programacao|show|atracao|atracoes|festa|lancamento oficial|feira|exposicao|arte|cultura|palco|concurso|rodeio)\b/, weight: 2.6 },
  // Infraestrutura e operações
  { category: 'infraestrutura', pattern: /\b(infraestrutura|obra|obras|montagem|desmontagem|pavilhao|pavilhoes|eletric\w*|hidraul\w*|estrutura|manutencao|limpeza|seguranca|ppci|gerador|banheiro|parque de exposicoes|instalacao)\b/, weight: 2.4 },
  // Logística e mobilidade
  { category: 'logistica', pattern: /\b(logistica|transporte|transportes|van|vans|onibus|carro eletrico|patinete|estacionamento|mobilidade|frota|hotelaria|hospedagem|traslado|combustivel)\b/, weight: 2.4 },
  // Cerimonial e protocolo
  { category: 'cerimonial', pattern: /\b(cerimonial|protocolo|solenidade|mestre de cerimonias|honra|hino|autoridades|descerramento)\b/, weight: 2.4 },
  // Relações institucionais e representações
  { category: 'representacoes', pattern: /\b(representacao|representacoes|comitiva|visita institucional|recepcao (da|do|de) comitiva|governador|prefeit\w*|ministerio|camara de vereadores|convite institucional|missao)\b/, weight: 2.4 },
  // Financeiro e administrativo
  { category: 'financeiro', pattern: /\b(orcament\w*|financeiro|pagamento|prestacao de contas|contabil|tesouraria|nota fiscal|reembolso|custo|balanco)\b/, weight: 1.8 },
  { category: 'financeiro', pattern: /\b(contratacao|fornecedor|fornecedores|licitacao|cotacao de precos|contrato administrativo)\b/, weight: 1.2 },
  // Tecnologia e sistemas
  { category: 'tecnologia', pattern: /\b(sistema|sistemas|software|aplicativo|portal|site institucional|plataforma|tecnologia|\bti\b|banco de dados|integracao tecnica|credenciamento digital)\b/, weight: 2.4 },
  // Governança (topical, not the Central-presence rule)
  { category: 'governanca', pattern: /\b(planejamento estrategico|gestao|diretoria|estatuto|regimento|coordenacao geral|cronograma geral|organograma)\b/, weight: 1.6 },
];

const CENTRAL_PATTERN = /\b(comissao central|presidencia|presidente|vice-presidente|vice presidente|diretoria executiva|comite executivo|direcao geral)\b/;
const GOVERNANCE_CONTEXT = /\b(reuniao|deliberacao|delibera|definir|definicao|planejamento|coordenacao|decisao|alinhamento|aprovacao|estrategic\w*|institucional interna)\b/;

/** A strong topical signal outranks the mere presence of Central/presidency people. */
const TOPICAL_OVERRIDE_THRESHOLD = 2.5;

function classifyCategory(
  text: string,
  contextText: string,
  usedSignals: ClassificationSignal[],
): ClassificationResult<CronogramaCategory> {
  const haystack = `${text} ${contextText}`.trim();
  if (!haystack) return { value: 'governanca', confidence: 0.2, source: ['fallback'] };

  const scores = new Map<CronogramaCategory, number>();
  for (const rule of CATEGORY_SIGNALS) {
    const inTitle = rule.pattern.test(text);
    const inContext = rule.pattern.test(contextText);
    if (!inTitle && !inContext) continue;
    const weight = inTitle ? rule.weight : rule.weight * 0.55;
    scores.set(rule.category, (scores.get(rule.category) ?? 0) + weight);
  }

  const topicalMax = Math.max(0, ...[...scores.entries()]
    .filter(([category]) => category !== 'governanca')
    .map(([, score]) => score));

  const source: ClassificationSignal[] = [...usedSignals];
  if (CENTRAL_PATTERN.test(haystack)) {
    const governanceBoost = topicalMax >= TOPICAL_OVERRIDE_THRESHOLD
      ? 0.5
      : GOVERNANCE_CONTEXT.test(haystack)
        ? 2.9
        : 2.2;
    scores.set('governanca', (scores.get('governanca') ?? 0) + governanceBoost);
    source.push('governance-rule');
  }

  if (scores.size === 0) {
    return { value: 'governanca', confidence: 0.25, source: ['fallback'] };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const confidence = Math.min(0.96, Math.max(0.3, bestScore / (bestScore + runnerUp || 1)));
  return { value: best, confidence, source };
}

/**
 * Layered classifier: deterministic intent rules, contextual signals and the
 * special Governance rule. Pure and synchronous — safe to run on every keystroke.
 */
export function classifyEvent(input: EventClassificationInput): EventClassification {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const description = normalizeText(input.description);
  const commissions = (input.commissions ?? []).map(normalizeText).filter(Boolean);
  const people = (input.people ?? []).map(normalizeText).filter(Boolean);
  const owner = normalizeText(input.owner);
  const location = normalizeText(input.location);

  const titleText = [title, summary, description].filter(Boolean).join(' ');
  const contextText = [...commissions, ...people, owner, location].filter(Boolean).join(' ');

  const signals: ClassificationSignal[] = [];
  if (title) signals.push('title');
  if (summary) signals.push('summary');
  if (description) signals.push('description');
  if (commissions.length) signals.push('commission');
  if (people.length) signals.push('participants');
  if (owner) signals.push('owner');
  if (location) signals.push('location');

  const kind = classifyKind(titleText);
  const category = classifyCategory(titleText, contextText, signals.filter((signal) => signal !== 'location'));

  return {
    category,
    kind: { ...kind, source: kind.source.includes('fallback') ? kind.source : signals.slice(0, 1) as ClassificationSignal[] },
  };
}

/** Classify a free-text legacy category label onto the canonical taxonomy. */
export function classifyLegacyCategoryLabel(label: string | null | undefined): CronogramaCategory | null {
  const direct = normalizeLegacyCategory(label);
  if (direct) return direct;
  if (!label) return null;
  const result = classifyCategory(normalizeText(label), '', ['title']);
  return result.source.includes('fallback') ? null : result.value;
}
