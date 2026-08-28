/**
 * Catálogo oficial das Comissões e Assessorias da Fenasoja 2028.
 *
 * Fonte: planilha "COMISSÃO CENTRAL FENASOJA 2028" — reconciliada com o registro
 * institucional já existente no banco (tabela `commissions`) e com os módulos
 * operacionais já implementados em `commissionRegistry` / `commissionMapPortalRegistry`.
 *
 * Regras:
 * - `id` é o slug canônico usado no banco.
 * - `moduleSlug` aponta para um módulo JÁ existente quando houver correspondência
 *   (nunca cria um segundo módulo para a mesma frente).
 * - `aliases` cobre nomes abreviados/variações para reconciliação.
 * - Frentes sem módulo próprio recebem um módulo derivado desta configuração,
 *   com rota estável `/comissoes/<id>/dashboard`.
 */
import {
  Ambulance,
  Baby,
  Banknote,
  Building2,
  Camera,
  CalendarCheck,
  Car,
  Factory,
  Flame,
  Gavel,
  Globe2,
  HandHeart,
  HardHat,
  Handshake,
  Leaf,
  Lightbulb,
  Megaphone,
  Music4,
  Newspaper,
  Palette,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sprout,
  Ticket,
  Tractor,
  Truck,
  UserCheck,
  UsersRound,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  commissionModules,
  visualThemes,
  type CommissionModule,
  type CommissionTone,
} from './commissionRegistry';

export type OfficialUnitType = 'comissao' | 'assessoria';

export interface OfficialUnitEntry {
  /** Slug canônico (igual ao registro institucional do banco). */
  id: string;
  name: string;
  shortName?: string;
  type: OfficialUnitType;
  order: number;
  /** Módulo já existente que representa esta frente, quando houver. */
  moduleSlug?: string;
  aliases: string[];
  icon: LucideIcon;
  tone: CommissionTone;
  /** Responsável oficial (exibido inclusive para visitantes não autenticados). */
  responsible: string;
  responsibleRole?: string;
  description: string;
}

function capabilityFor(id: string) {
  return `${id.replace(/-/g, '_')}_access`;
}

export const OFFICIAL_COMMISSION_UNITS: readonly OfficialUnitEntry[] = [
  {
    id: 'acolhimento-e-bem-comum',
    name: 'Acolhimento e Bem Comum',
    type: 'comissao',
    order: 1,
    aliases: ['acolhimento'],
    icon: HandHeart,
    tone: 'rose',
    responsible: 'Bruna Pacheco de Quadros',
    description: 'Acolhimento institucional, voluntariado e ações de bem comum da Fenasoja.',
  },
  {
    id: 'agricultura-soja-e-derivados',
    name: 'Agricultura, Soja e Derivados',
    shortName: 'Agricultura e Soja',
    type: 'comissao',
    order: 2,
    aliases: ['agricultura', 'soja e derivados'],
    icon: Sprout,
    tone: 'lime',
    responsible: 'Vanessa Matraszek Gnoatto',
    description: 'Programação técnica, parcerias e conteúdo do setor agrícola e da cadeia da soja.',
  },
  {
    id: 'arte-e-cultura',
    name: 'Arte e Cultura',
    type: 'comissao',
    order: 3,
    moduleSlug: 'arte-cultura',
    aliases: ['arte-cultura', 'arte e cultura'],
    icon: Palette,
    tone: 'rose',
    responsible: 'Leonardo Chitolina',
    description: 'Atrações, artistas, palcos, agenda cultural e demandas técnicas.',
  },
  {
    id: 'bilheteria',
    name: 'Bilheteria',
    type: 'comissao',
    order: 4,
    aliases: [],
    icon: Ticket,
    tone: 'amber',
    responsible: 'José Fernando Borella',
    description: 'Ingressos, pontos de venda, controle de acesso pago e prestação de contas.',
  },
  {
    id: 'credenciamento',
    name: 'Credenciamento',
    type: 'comissao',
    order: 5,
    aliases: [],
    icon: UserCheck,
    tone: 'sky',
    responsible: 'Larissa Mello Dallalba',
    description: 'Credenciais, acessos, cadastros e identificação de equipes e convidados.',
  },
  {
    id: 'cooperativismo',
    name: 'Cooperativismo',
    type: 'comissao',
    order: 6,
    aliases: [],
    icon: Handshake,
    tone: 'emerald',
    responsible: "Alexandre Dall'Agnese",
    description: 'Relação com cooperativas, programação conjunta e ações do movimento cooperativista.',
  },
  {
    id: 'espaco-do-automovel',
    name: 'Espaço do Automóvel',
    type: 'comissao',
    order: 7,
    aliases: ['automovel', 'espaco automovel'],
    icon: Car,
    tone: 'cyan',
    responsible: 'Elton Luis Walker',
    description: 'Expositores automotivos, test drive e organização do espaço do automóvel.',
  },
  {
    id: 'exporural',
    name: 'Exporural',
    type: 'comissao',
    order: 8,
    moduleSlug: 'exporural',
    aliases: ['expo rural'],
    icon: Tractor,
    tone: 'emerald',
    responsible: 'Germano Tessmer Büttow',
    description: 'Gestão comercial e operacional das quadras rurais da Exporural.',
  },
  {
    id: 'gastronomia',
    name: 'Gastronomia',
    type: 'comissao',
    order: 9,
    moduleSlug: 'gastronomia',
    aliases: [],
    icon: UtensilsCrossed,
    tone: 'amber',
    responsible: 'Rodrigo Calixto',
    description: 'Fichas, refeições, consumo por comissão, estoque e devoluções.',
  },
  {
    id: 'industria-comercio-e-servicos',
    name: 'Indústria, Comércio e Serviços',
    shortName: 'Indústria e Comércio',
    type: 'comissao',
    order: 10,
    moduleSlug: 'industria-comercio-servicos',
    aliases: ['ics', 'industria comercio servicos'],
    icon: Factory,
    tone: 'cyan',
    responsible: 'Felipe Bortoli',
    description: 'Gestão comercial dos pavilhões e das frentes de indústria, comércio e serviços.',
  },
  {
    id: 'infraestrutura-e-seguranca-do-trabalho',
    name: 'Infraestrutura e Segurança do Trabalho',
    shortName: 'Infraestrutura',
    type: 'comissao',
    order: 11,
    moduleSlug: 'infraestrutura',
    aliases: ['infraestrutura'],
    icon: HardHat,
    tone: 'lime',
    responsible: 'Roberto Steffen',
    description: 'Obras, materiais, demandas, equipes, fornecedores e segurança do trabalho.',
  },
  {
    id: 'inovacao-e-experiencia',
    name: 'Inovação e Tecnologia',
    type: 'comissao',
    order: 12,
    aliases: ['inovacao', 'inovacao e tecnologia', 'inovacao-e-tecnologia'],
    icon: Lightbulb,
    tone: 'sky',
    responsible: 'Felipe Carpenedo Gabriel',
    description: 'Projetos de inovação, tecnologia aplicada e experiências digitais do parque.',
  },
  {
    id: 'logistica-hotelaria-e-turismo',
    name: 'Logística, Hotelaria e Turismo',
    shortName: 'Logística',
    type: 'comissao',
    order: 13,
    moduleSlug: 'logistica',
    aliases: ['logistica', 'logistica hotelaria turismo'],
    icon: Truck,
    tone: 'emerald',
    responsible: 'Eduardo Santos',
    description: 'Transportes, frota, carrinhos, agenda, hóspedes e operação da mobilidade.',
  },
  {
    id: 'mercosul',
    name: 'Mercosul',
    type: 'comissao',
    order: 14,
    aliases: [],
    icon: Globe2,
    tone: 'sky',
    responsible: 'Raul Dário Nunez',
    description: 'Relações com países do Mercosul, delegações e programação internacional.',
  },
  {
    id: 'novas-geracoes',
    name: 'Novas Gerações',
    type: 'comissao',
    order: 15,
    moduleSlug: 'novas-geracoes',
    aliases: [],
    icon: Baby,
    tone: 'sky',
    responsible: 'Josyane Cristina Heck',
    description: 'Programação para crianças, jovens e escolas durante a feira.',
  },
  {
    id: 'pecuaria',
    name: 'Pecuária',
    type: 'comissao',
    order: 16,
    aliases: [],
    icon: Tractor,
    tone: 'lime',
    responsible: 'Elisandra Simão Reis',
    description: 'Exposição animal, julgamentos, remates e estrutura pecuária.',
  },
  {
    id: 'prevencao-e-combate-a-incendio',
    name: 'Prevenção e Combate a Incêndio',
    shortName: 'PPCI',
    type: 'comissao',
    order: 17,
    aliases: ['ppci', 'incendio'],
    icon: Flame,
    tone: 'red',
    responsible: 'Cap. Leonardo Ruy Dambroz',
    description: 'Plano de prevenção, brigadas, vistorias e resposta a emergências.',
  },
  {
    id: 'recepcao-e-cerimonial',
    name: 'Recepção e Eventos',
    type: 'comissao',
    order: 18,
    aliases: ['recepcao', 'cerimonial', 'recepcao e eventos'],
    icon: CalendarCheck,
    tone: 'gold',
    responsible: 'Thaís Bróglio',
    description: 'Recepção de autoridades, cerimonial e organização dos eventos oficiais.',
  },
  {
    id: 'relacionamento-e-experiencia',
    name: 'Relacionamento e Experiência',
    type: 'comissao',
    order: 19,
    aliases: ['relacionamento'],
    icon: Sparkles,
    tone: 'rose',
    responsible: 'Fernanda Matarucco Meinertz',
    description: 'Experiência do público, relacionamento institucional e jornada do visitante.',
  },
  {
    id: 'relacoes-estrategicas',
    name: 'Relações Estratégicas',
    type: 'comissao',
    order: 20,
    aliases: ['relacoes estrategicas'],
    icon: Building2,
    tone: 'gold',
    responsible: 'Paulo Miguel Nedel e Diana Schmidt Nedel',
    description: 'Articulação institucional, parcerias estratégicas e relacionamento executivo.',
  },
  {
    id: 'saude-bem-estar-e-acessibilidade',
    name: 'Saúde, Bem-Estar e Acessibilidade',
    shortName: 'Saúde e Acessibilidade',
    type: 'comissao',
    order: 21,
    aliases: ['saude', 'acessibilidade'],
    icon: Ambulance,
    tone: 'teal',
    responsible: 'Rosa Zorzan de Paula',
    description: 'Atendimento em saúde, bem-estar das equipes e acessibilidade do parque.',
  },
  {
    id: 'seguranca',
    name: 'Segurança',
    type: 'comissao',
    order: 22,
    moduleSlug: 'seguranca',
    aliases: [],
    icon: ShieldCheck,
    tone: 'red',
    responsible: 'Ten. Cel. Vanessa Peripolli',
    description: 'Escalas, ocorrências, pontos críticos e coordenação da segurança.',
  },
  {
    id: 'servicos',
    name: 'Serviços',
    type: 'comissao',
    order: 23,
    moduleSlug: 'servicos',
    aliases: [],
    icon: Wrench,
    tone: 'cyan',
    responsible: 'Valtair Dornelles',
    description: 'Chamados, demandas, equipes, status de execução e ocorrências operacionais.',
  },
  {
    id: 'shows',
    name: 'Shows',
    type: 'comissao',
    order: 24,
    aliases: [],
    icon: Music4,
    tone: 'rose',
    responsible: 'Daniel U. Ribeiro da Silva',
    description: 'Grade de shows, contratos artísticos, produção e operação de palco.',
  },
  {
    id: 'soja-store',
    name: 'Soja Store',
    type: 'comissao',
    order: 25,
    aliases: ['sojastore'],
    icon: ShoppingBag,
    tone: 'amber',
    responsible: 'Cristina Beatriz Manjabosco Scheuermann',
    description: 'Produtos oficiais, loja da feira, estoque e vendas institucionais.',
  },
  {
    id: 'soy-summit',
    name: 'Soy Summit',
    type: 'comissao',
    order: 26,
    aliases: ['soysummit'],
    icon: Megaphone,
    tone: 'gold',
    responsible: 'Cassio Ricardo Feltes',
    description: 'Congresso técnico, painéis, palestrantes e conteúdo estratégico do Soy Summit.',
  },
  {
    id: 'assessoria-de-sustentabilidade',
    name: 'Assessoria de Sustentabilidade',
    type: 'assessoria',
    order: 1,
    aliases: ['sustentabilidade'],
    icon: Leaf,
    tone: 'emerald',
    responsible: 'Estela Zamberlam Schwerz',
    description: 'Diretrizes ambientais, resíduos, compensações e práticas sustentáveis.',
  },
  {
    id: 'assessoria-de-imprensa',
    name: 'Assessoria de Imprensa',
    type: 'assessoria',
    order: 2,
    aliases: ['imprensa'],
    icon: Newspaper,
    tone: 'sky',
    responsible: 'Deise Anelise Froelich e Francine Maria Boijink',
    description: 'Relacionamento com a imprensa, pauta oficial e cobertura da feira.',
  },
  {
    id: 'assessoria-juridica',
    name: 'Assessoria Jurídica',
    type: 'assessoria',
    order: 3,
    aliases: ['juridica', 'juridico'],
    icon: Scale,
    tone: 'gold',
    responsible: 'José Mauro Barbieri e Sandra Lameira',
    description: 'Contratos, pareceres, conformidade legal e apoio jurídico às comissões.',
  },
  {
    id: 'assessoria-de-relacoes-internacionais',
    name: 'Assessoria de Relações Internacionais',
    shortName: 'Relações Internacionais',
    type: 'assessoria',
    order: 4,
    aliases: ['relacoes internacionais'],
    icon: Globe2,
    tone: 'cyan',
    responsible: 'Júlio Bravo, Roberto Adriano Racho e Sara Kirchhof Varela',
    description: 'Delegações estrangeiras, missões e agenda internacional da Fenasoja.',
  },
  {
    id: 'assessoria-de-protocolo',
    name: 'Assessoria de Protocolo',
    type: 'assessoria',
    order: 5,
    aliases: ['protocolo'],
    icon: Gavel,
    tone: 'gold',
    responsible: 'Jorge Luiz Viana',
    description: 'Protocolo oficial, precedência de autoridades e ritos institucionais.',
  },
  {
    id: 'assessoria-de-marketing',
    name: 'Assessoria de Marketing e Comunicação',
    shortName: 'Marketing e Comunicação',
    type: 'assessoria',
    order: 6,
    aliases: ['marketing', 'marketing e comunicacao', 'assessoria de marketing e comunicacao'],
    icon: Camera,
    tone: 'rose',
    responsible: 'Zélia Savoldi',
    responsibleRole: 'Diretora de Marketing e Comunicação',
    description: 'Marca, campanhas, conteúdo e comunicação institucional da Fenasoja.',
  },
];

/** Frentes registradas no banco que NÃO são exibidas como card no portal. */
export const NON_PORTAL_UNIT_SLUGS: readonly string[] = [
  'central',
  'assessoria-de-sistemas',
  'assessoria-projetos-e-captacoes-institucionais',
  'fotografia',
];

/** Cards descontinuados (fora da lista oficial). */
export const RETIRED_MODULE_SLUGS: readonly string[] = ['limpeza'];

export function normalizeUnitKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const dashboardMenu = {
  label: 'Painel da Comissão',
  path: 'dashboard',
  description: 'Visão inicial e acompanhamento da frente.',
} as const;

function buildDerivedModule(entry: OfficialUnitEntry): CommissionModule {
  const theme = visualThemes[entry.tone];
  return {
    slug: entry.id,
    name: entry.name,
    shortName: entry.shortName ?? entry.name,
    description: entry.description,
    icon: entry.icon,
    accentClass: theme.accentGradient,
    visual: theme,
    status: 'structuring',
    capability: capabilityFor(entry.id),
    sensitive: false,
    adminOnly: false,
    basePath: `/comissoes/${entry.id}`,
    order: (entry.type === 'assessoria' ? 200 : 100) + entry.order,
    publicPortal: true,
    menus: [{ ...dashboardMenu, icon: entry.icon }],
  };
}

export interface OfficialUnitResolution {
  entry: OfficialUnitEntry;
  module: CommissionModule;
  /** true quando a frente reaproveita um módulo já implementado. */
  reusesExistingModule: boolean;
}

const resolutions: OfficialUnitResolution[] = OFFICIAL_COMMISSION_UNITS.map((entry) => {
  const existing = entry.moduleSlug
    ? commissionModules.find((module) => module.slug === entry.moduleSlug)
    : undefined;

  if (existing) {
    return {
      entry,
      // Nome oficial no portal e na navegação, preservando slug, rota, permissões e menus.
      module: { ...existing, name: entry.name, shortName: entry.shortName ?? existing.shortName },
      reusesExistingModule: true,
    };
  }

  return { entry, module: buildDerivedModule(entry), reusesExistingModule: false };
});

export const officialUnitResolutions: readonly OfficialUnitResolution[] = resolutions;

/** Módulos derivados (frentes que ainda não possuem módulo dedicado). */
export const derivedCommissionModules: readonly CommissionModule[] = resolutions
  .filter((item) => !item.reusesExistingModule)
  .map((item) => item.module);

const bySlug = new Map<string, OfficialUnitResolution>();
for (const resolution of resolutions) {
  const keys = [
    resolution.entry.id,
    resolution.entry.moduleSlug,
    ...resolution.entry.aliases,
    resolution.entry.name,
  ].filter(Boolean) as string[];
  for (const key of keys) {
    const normalized = normalizeUnitKey(key);
    if (!bySlug.has(normalized)) bySlug.set(normalized, resolution);
  }
}

/** Reconciliação por slug canônico, slug legado, alias ou nome. */
export function resolveOfficialUnit(value?: string | null): OfficialUnitResolution | undefined {
  if (!value) return undefined;
  return bySlug.get(normalizeUnitKey(value));
}

/**
 * Módulo utilizado pelas rotas: prioriza módulos já registrados e completa com
 * os módulos derivados das frentes oficiais.
 */
export function resolveCommissionRouteModule(slug?: string | null): CommissionModule | undefined {
  if (!slug) return undefined;
  const registered = commissionModules.find((module) => module.slug === slug);
  if (registered) {
    if (RETIRED_MODULE_SLUGS.includes(registered.slug)) return undefined;
    const official = resolveOfficialUnit(registered.slug);
    return official?.module ?? registered;
  }
  const official = resolveOfficialUnit(slug);
  return official?.module;
}

export interface OfficialUnitGroup {
  type: OfficialUnitType;
  label: string;
  items: OfficialUnitResolution[];
}

export function getOfficialUnitGroups(): OfficialUnitGroup[] {
  const comissoes = resolutions
    .filter((item) => item.entry.type === 'comissao')
    .sort((a, b) => a.entry.order - b.entry.order);
  const assessorias = resolutions
    .filter((item) => item.entry.type === 'assessoria')
    .sort((a, b) => a.entry.order - b.entry.order);

  return [
    { type: 'comissao', label: 'Comissões', items: comissoes },
    { type: 'assessoria', label: 'Assessorias', items: assessorias },
  ];
}
