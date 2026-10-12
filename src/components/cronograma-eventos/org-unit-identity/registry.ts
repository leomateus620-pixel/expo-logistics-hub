import {
  Car,
  ConciergeBell,
  Factory,
  FileBadge,
  FireExtinguisher,
  Flag,
  GraduationCap,
  HandHeart,
  Handshake,
  HardHat,
  HeartPulse,
  IdCard,
  Landmark,
  Leaf,
  Lightbulb,
  Luggage,
  Megaphone,
  MessageCircleHeart,
  Music4,
  Network,
  Newspaper,
  Palette,
  Presentation,
  Scale,
  ShieldCheck,
  Shapes,
  ShoppingBag,
  Sprout,
  Ticket,
  Tractor,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { normalizeSearchTerm } from '@/lib/org-units';
import {
  InternationalGlyph,
  LivestockGlyph,
  ProjectsGlyph,
  SystemsGlyph,
} from './glyphs';

/**
 * Categoria apresentada ao usuário. É uma camada de apresentação: o cadastro
 * continua guardando `unit_type` e nenhum filtro ou vínculo depende disto.
 */
export type OrgUnitKind = 'conselho' | 'comissao' | 'assessoria';

export interface OrgUnitIdentity {
  /** Identificador estável: slug canônico da unidade em `commissions.slug`. */
  id: string;
  kind: OrgUnitKind;
  /** Nome oficial usado apenas como chave exata de reconciliação. */
  name: string;
  /** Justificativa do símbolo (documentação da família). */
  concept: string;
  icon: LucideIcon | null;
  /** Marca oficial reduzida no lugar de um traço. */
  symbol?: 'fenasoja';
  /** Slugs herdados de renomeações históricas que mantiveram o mesmo registro. */
  legacySlugs?: readonly string[];
  /** Outras grafias oficiais exatas do nome (comparadas sem acento/caixa). */
  nameAliases?: readonly string[];
}

export const CCPF_IDENTITY_ID = 'ccpf';

const definitions: readonly OrgUnitIdentity[] = [
  {
    id: 'ccpf',
    kind: 'conselho',
    name: 'CCPF — Conselho Consultivo Permanente Fenasoja',
    concept: 'Símbolo oficial da FENASOJA (sol sobre a lavoura), versão reduzida',
    icon: null,
    symbol: 'fenasoja',
    nameAliases: ['CCPF'],
  },

  { id: 'assessoria-de-sistemas', kind: 'assessoria', name: 'Assessoria de Sistemas', concept: 'Monitor com elemento de código', icon: SystemsGlyph },
  { id: 'assessoria-de-sustentabilidade', kind: 'assessoria', name: 'Assessoria de Sustentabilidade', concept: 'Folha de desenho orgânico', icon: Leaf },
  { id: 'assessoria-de-imprensa', kind: 'assessoria', name: 'Assessoria de Imprensa', concept: 'Jornal / publicação editorial', icon: Newspaper },
  {
    id: 'assessoria-de-projetos-e-captacoes',
    kind: 'assessoria',
    name: 'Assessoria de Projetos e Captações',
    concept: 'Documento de projeto com indicador de evolução',
    icon: ProjectsGlyph,
    legacySlugs: ['assessoria-projetos-e-captacoes-institucionais'],
  },
  { id: 'assessoria-juridica', kind: 'assessoria', name: 'Assessoria Jurídica', concept: 'Balança de proporções refinadas', icon: Scale },
  { id: 'assessoria-de-relacoes-internacionais', kind: 'assessoria', name: 'Assessoria de Relações Internacionais', concept: 'Globo com conexões discretas', icon: InternationalGlyph },
  { id: 'assessoria-de-protocolo', kind: 'assessoria', name: 'Assessoria de Protocolo', concept: 'Documento cerimonial com selo de credencial', icon: FileBadge },
  {
    id: 'assessoria-de-marketing',
    kind: 'assessoria',
    name: 'Assessoria de Marketing/Comunicação',
    concept: 'Megafone dinâmico',
    icon: Megaphone,
    nameAliases: ['Assessoria de Marketing'],
  },

  { id: 'acolhimento-e-bem-comum', kind: 'comissao', name: 'Acolhimento e Bem Comum', concept: 'Mão que acolhe um coração', icon: HandHeart },
  { id: 'agricultura-soja-e-derivados', kind: 'comissao', name: 'Agricultura, Soja e Derivados', concept: 'Broto da lavoura', icon: Sprout },
  { id: 'soy-summit', kind: 'comissao', name: 'Soy Summit', concept: 'Palestra e apresentação do encontro', icon: Presentation },
  {
    id: 'inovacao-e-experiencia',
    kind: 'comissao',
    name: 'Inovação e Tecnologia',
    concept: 'Lâmpada de ideias',
    icon: Lightbulb,
  },
  { id: 'arte-e-cultura', kind: 'comissao', name: 'Arte e Cultura', concept: 'Paleta de artista', icon: Palette },
  { id: 'bilheteria', kind: 'comissao', name: 'Bilheteria', concept: 'Ingresso', icon: Ticket },
  { id: 'credenciamento', kind: 'comissao', name: 'Credenciamento', concept: 'Crachá de identificação', icon: IdCard },
  { id: 'cooperativismo', kind: 'comissao', name: 'Cooperativismo', concept: 'Aperto de mãos cooperativo', icon: Handshake },
  { id: 'espaco-do-automovel', kind: 'comissao', name: 'Espaço do Automóvel', concept: 'Automóvel', icon: Car },
  { id: 'exporural', kind: 'comissao', name: 'Exporural', concept: 'Trator', icon: Tractor },
  { id: 'industria-comercio-e-servicos', kind: 'comissao', name: 'Indústria, Comércio e Serviços', concept: 'Fábrica', icon: Factory },
  {
    id: 'infraestrutura-e-seguranca-do-trabalho',
    kind: 'comissao',
    name: 'Infraestrutura e Segurança do Trabalho',
    concept: 'Capacete de obra',
    icon: HardHat,
    legacySlugs: ['infraestrutura'],
  },
  {
    id: 'relacionamento-e-experiencia',
    kind: 'comissao',
    name: 'Relacionamento e Experiência',
    concept: 'Conversa que gera afeto',
    icon: MessageCircleHeart,
  },
  {
    id: 'logistica-hotelaria-e-turismo',
    kind: 'comissao',
    name: 'Logística, Hotelaria e Turismo',
    concept: 'Mala de viagem',
    icon: Luggage,
    legacySlugs: ['logistica'],
  },
  { id: 'novas-geracoes', kind: 'comissao', name: 'Novas Gerações', concept: 'Capelo de formatura', icon: GraduationCap },
  { id: 'pecuaria', kind: 'comissao', name: 'Pecuária', concept: 'Cabeça de bovino', icon: LivestockGlyph },
  { id: 'prevencao-e-combate-a-incendio', kind: 'comissao', name: 'Prevenção e Combate a Incêndio', concept: 'Extintor', icon: FireExtinguisher },
  {
    id: 'recepcao-e-cerimonial',
    kind: 'comissao',
    name: 'Recepção e Eventos',
    concept: 'Sineta de recepção',
    icon: ConciergeBell,
  },
  { id: 'relacoes-estrategicas', kind: 'comissao', name: 'Relações Estratégicas', concept: 'Rede de conexões', icon: Network },
  {
    id: 'saude-bem-estar-e-acessibilidade',
    kind: 'comissao',
    name: 'Saúde, Bem-Estar e Acessibilidade',
    concept: 'Coração com pulsação',
    icon: HeartPulse,
    legacySlugs: ['acessibilidade-e-inclusao'],
  },
  { id: 'seguranca', kind: 'comissao', name: 'Segurança', concept: 'Escudo de proteção', icon: ShieldCheck },
  { id: 'mercosul', kind: 'comissao', name: 'Mercosul', concept: 'Bandeira do bloco regional', icon: Flag },
  { id: 'servicos', kind: 'comissao', name: 'Serviços', concept: 'Chave de serviço', icon: Wrench },
  { id: 'soja-store', kind: 'comissao', name: 'Soja Store', concept: 'Sacola de loja', icon: ShoppingBag },
  { id: 'shows', kind: 'comissao', name: 'Shows', concept: 'Nota musical', icon: Music4 },
  { id: 'central', kind: 'comissao', name: 'Comissão Central', concept: 'Edifício institucional', icon: Landmark, nameAliases: ['Central'] },
];

export const ORG_UNIT_IDENTITIES: readonly OrgUnitIdentity[] = definitions;

const byId = new Map(definitions.map((item) => [item.id, item]));
const byLegacySlug = new Map(
  definitions.flatMap((item) => (item.legacySlugs ?? []).map((slug) => [slug, item] as const)),
);
const byName = new Map(
  definitions.flatMap((item) => [item.name, ...(item.nameAliases ?? [])]
    .map((name) => [normalizeSearchTerm(name), item] as const)),
);

export const FALLBACK_ORG_UNIT_ICON: LucideIcon = Shapes;

function normalizeSlug(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}

/**
 * Resolve a identidade pelo identificador estável (slug canônico, depois slug
 * histórico) e só então pelo nome oficial exato. Nunca usa posição na lista
 * nem trechos do nome.
 */
export function resolveOrgUnitIdentity(unit: {
  slug?: string | null;
  name?: string | null;
}): OrgUnitIdentity | null {
  const slug = normalizeSlug(unit.slug);
  if (slug) {
    const direct = byId.get(slug) ?? byLegacySlug.get(slug);
    if (direct) return direct;
  }
  const name = normalizeSearchTerm(unit.name);
  return name ? byName.get(name) ?? null : null;
}

export function getOrgUnitIdentity(id: string | null | undefined): OrgUnitIdentity | null {
  return id ? byId.get(id) ?? null : null;
}

export const ORG_UNIT_KIND_LABEL: Record<OrgUnitKind, string> = {
  conselho: 'Conselho',
  comissao: 'Comissão',
  assessoria: 'Assessoria',
};
