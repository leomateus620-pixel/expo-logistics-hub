import type { LucideIcon } from 'lucide-react';
import {
  BadgeDollarSign,
  Brush,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  ClipboardList,
  Construction,
  FileText,
  GraduationCap,
  HardHat,
  Hotel,
  LayoutDashboard,
  MapPin,
  Package,
  Palette,
  Receipt,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wrench,
  Zap,
} from 'lucide-react';

export type CommissionStatus = 'active' | 'structuring' | 'restricted';
export type CommissionTone = 'emerald' | 'amber' | 'lime' | 'cyan' | 'rose' | 'sky' | 'red' | 'teal' | 'gold';

export interface CommissionMenuItem {
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
}

export interface CommissionVisualTheme {
  tone: CommissionTone;
  accentColor: string;
  accentGradient: string;
  iconBackground: string;
  surfaceTint: string;
  chartThemeKey: string;
  motionHint: string;
}

export interface CommissionModule {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  accentClass: string;
  visual: CommissionVisualTheme;
  status: CommissionStatus;
  capability: string;
  sensitive: boolean;
  adminOnly: boolean;
  basePath: string;
  order: number;
  publicPortal: boolean;
  legacyRoutes?: string[];
  menus: CommissionMenuItem[];
}

export const SELECTED_COMMISSION_STORAGE_KEY = 'fenasoja-selected-commission-module';

export const statusLabels: Record<CommissionStatus, string> = {
  active: 'Ativo',
  structuring: 'Em estruturação',
  restricted: 'Acesso restrito',
};

export const statusClasses: Record<CommissionStatus, string> = {
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  structuring: 'border-gold/30 bg-gold/10 text-gold',
  restricted: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
};

const visualThemes: Record<CommissionTone, CommissionVisualTheme> = {
  emerald: {
    tone: 'emerald',
    accentColor: 'hsl(145 70% 30%)',
    accentGradient: 'from-emerald-500/25 via-gold/15 to-transparent',
    iconBackground: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
    surfaceTint: 'bg-emerald-500/[0.06]',
    chartThemeKey: 'logistics-command',
    motionHint: 'profundidade operacional e mobilidade',
  },
  amber: {
    tone: 'amber',
    accentColor: 'hsl(32 92% 45%)',
    accentGradient: 'from-amber-500/25 via-gold/10 to-transparent',
    iconBackground: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    surfaceTint: 'bg-amber-500/[0.06]',
    chartThemeKey: 'warm-service',
    motionHint: 'acolhimento, consumo e distribuição',
  },
  lime: {
    tone: 'lime',
    accentColor: 'hsl(92 58% 36%)',
    accentGradient: 'from-lime-500/25 via-emerald-500/10 to-transparent',
    iconBackground: 'bg-lime-500/10 text-lime-700 dark:text-lime-300',
    surfaceTint: 'bg-lime-500/[0.06]',
    chartThemeKey: 'infrastructure-solid',
    motionHint: 'estrutura técnica e avanço físico',
  },
  cyan: {
    tone: 'cyan',
    accentColor: 'hsl(188 78% 36%)',
    accentGradient: 'from-cyan-500/25 via-emerald-500/10 to-transparent',
    iconBackground: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    surfaceTint: 'bg-cyan-500/[0.055]',
    chartThemeKey: 'services-clean',
    motionHint: 'operação funcional e chamados',
  },
  rose: {
    tone: 'rose',
    accentColor: 'hsl(345 72% 45%)',
    accentGradient: 'from-rose-500/25 via-gold/10 to-transparent',
    iconBackground: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    surfaceTint: 'bg-rose-500/[0.055]',
    chartThemeKey: 'culture-stage',
    motionHint: 'programação cultural expressiva',
  },
  sky: {
    tone: 'sky',
    accentColor: 'hsl(205 80% 43%)',
    accentGradient: 'from-sky-500/25 via-emerald-500/10 to-transparent',
    iconBackground: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    surfaceTint: 'bg-sky-500/[0.055]',
    chartThemeKey: 'education-light',
    motionHint: 'leveza educacional e organização',
  },
  red: {
    tone: 'red',
    accentColor: 'hsl(0 65% 42%)',
    accentGradient: 'from-red-500/25 via-gold/10 to-transparent',
    iconBackground: 'bg-red-500/10 text-red-700 dark:text-red-300',
    surfaceTint: 'bg-red-500/[0.055]',
    chartThemeKey: 'security-control',
    motionHint: 'controle sóbrio e monitoramento',
  },
  teal: {
    tone: 'teal',
    accentColor: 'hsl(173 66% 34%)',
    accentGradient: 'from-teal-500/25 via-emerald-500/10 to-transparent',
    iconBackground: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    surfaceTint: 'bg-teal-500/[0.055]',
    chartThemeKey: 'clean-routine',
    motionHint: 'rotina clara e organizada',
  },
  gold: {
    tone: 'gold',
    accentColor: 'hsl(45 87% 45%)',
    accentGradient: 'from-yellow-500/25 via-red-500/10 to-transparent',
    iconBackground: 'bg-gold/15 text-gold',
    surfaceTint: 'bg-gold/[0.06]',
    chartThemeKey: 'executive-finance',
    motionHint: 'gestão executiva e acesso sensível',
  },
};

const dashboardMenu: CommissionMenuItem = {
  label: 'Painel da Comissão',
  path: 'dashboard',
  description: 'Visão inicial e acompanhamento do módulo.',
  icon: LayoutDashboard,
};

export const commissionModules: CommissionModule[] = [
  {
    slug: 'logistica',
    name: 'Logística',
    shortName: 'Logística',
    description: 'Transportes, frota, carrinhos, agenda, hóspedes e operação da mobilidade.',
    icon: Truck,
    accentClass: visualThemes.emerald.accentGradient,
    visual: visualThemes.emerald,
    status: 'active',
    capability: 'logistica_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/logistica',
    order: 1,
    publicPortal: true,
    legacyRoutes: ['/', '/transports', '/vehicles', '/electric-carts', '/guests', '/agenda', '/checklist', '/team', '/expenses', '/system-report'],
    menus: [
      { ...dashboardMenu, label: 'Painel Operacional', description: 'Centro de comando da mobilidade e indicadores da operação.' },
      { label: 'Transportes', path: 'transportes', description: 'Solicitações, corridas e deslocamentos.', icon: MapPin },
      { label: 'Veículos', path: 'veiculos', description: 'Frota, disponibilidade e manutenções.', icon: Truck },
      { label: 'Carrinhos Elétricos', path: 'carrinhos-eletricos', description: 'Operação e reservas dos carrinhos elétricos.', icon: Zap },
      { label: 'Hóspedes', path: 'hospedes', description: 'Rede hoteleira e apoio aos convidados.', icon: Hotel },
      { label: 'Agenda', path: 'agenda', description: 'Eventos, compromissos e programação.', icon: CalendarDays },
      { label: 'Equipe', path: 'equipe', description: 'Pessoas, escala e disponibilidade.', icon: Users },
      { label: 'Checklist', path: 'checklist', description: 'Tarefas operacionais e pendências.', icon: CheckSquare },
      { label: 'Despesas', path: 'despesas', description: 'Registros e comprovantes operacionais.', icon: Receipt },
      { label: 'Relatório do Sistema', path: 'relatorio', description: 'Relatórios e consolidação do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'gastronomia',
    name: 'Gastronomia',
    shortName: 'Gastronomia',
    description: 'Fichas, refeições, consumo por comissão, estoque e devoluções.',
    icon: UtensilsCrossed,
    accentClass: visualThemes.amber.accentGradient,
    visual: visualThemes.amber,
    status: 'structuring',
    capability: 'gastronomia_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/gastronomia',
    order: 2,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Fichas', path: 'fichas', description: 'Fichas operacionais e controles previstos.', icon: ClipboardList },
      { label: 'Refeições', path: 'refeicoes', description: 'Planejamento e acompanhamento de refeições.', icon: UtensilsCrossed },
      { label: 'Consumo por Comissão', path: 'consumo', description: 'Consumo por comissão e período.', icon: ChartColumn },
      { label: 'Estoque', path: 'estoque', description: 'Itens, entradas e saldos previstos.', icon: Package },
      { label: 'Devoluções', path: 'devolucoes', description: 'Fluxo de retorno e conferência.', icon: RefreshCcw },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'infraestrutura',
    name: 'Infraestrutura',
    shortName: 'Infraestrutura',
    description: 'Obras, materiais, demandas, equipes, fornecedores e avanço físico.',
    icon: HardHat,
    accentClass: visualThemes.lime.accentGradient,
    visual: visualThemes.lime,
    status: 'structuring',
    capability: 'infraestrutura_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/infraestrutura',
    order: 3,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Obras', path: 'obras', description: 'Frentes de obra e execução prevista.', icon: Construction },
      { label: 'Materiais', path: 'materiais', description: 'Materiais solicitados, recebidos e aplicados.', icon: Package },
      { label: 'Demandas', path: 'demandas', description: 'Demandas por área e prioridade.', icon: ClipboardList },
      { label: 'Equipes', path: 'equipes', description: 'Equipes internas e alocações.', icon: UsersRound },
      { label: 'Fornecedores', path: 'fornecedores', description: 'Base de fornecedores e contatos.', icon: Wrench },
      { label: 'Avanço Físico', path: 'avanco-fisico', description: 'Percentuais e marcos de execução.', icon: ChartColumn },
      { label: 'Anexos', path: 'anexos', description: 'Fotos, documentos e evidências.', icon: FileText },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'servicos',
    name: 'Serviços',
    shortName: 'Serviços',
    description: 'Chamados, demandas, equipes, status de execução e ocorrências operacionais.',
    icon: Wrench,
    accentClass: visualThemes.cyan.accentGradient,
    visual: visualThemes.cyan,
    status: 'structuring',
    capability: 'servicos_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/servicos',
    order: 4,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Chamados', path: 'chamados', description: 'Abertura e acompanhamento de chamados.', icon: ClipboardList },
      { label: 'Demandas', path: 'demandas', description: 'Demandas por prioridade e responsável.', icon: CheckSquare },
      { label: 'Equipes', path: 'equipes', description: 'Equipes e escalas de atendimento.', icon: UsersRound },
      { label: 'Status de Execução', path: 'status', description: 'Quadro de situação dos serviços.', icon: ChartColumn },
      { label: 'Ocorrências', path: 'ocorrencias', description: 'Registro de ocorrências operacionais.', icon: FileText },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'arte-cultura',
    name: 'Arte e Cultura',
    shortName: 'Arte e Cultura',
    description: 'Atrações, artistas, palcos, agenda, demandas técnicas e contratos.',
    icon: Palette,
    accentClass: visualThemes.rose.accentGradient,
    visual: visualThemes.rose,
    status: 'structuring',
    capability: 'arte_cultura_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/arte-cultura',
    order: 5,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Atrações', path: 'atracoes', description: 'Atrações e programação artística.', icon: Sparkles },
      { label: 'Artistas', path: 'artistas', description: 'Cadastro e acompanhamento de artistas.', icon: UsersRound },
      { label: 'Palcos', path: 'palcos', description: 'Palcos, locais e estruturas.', icon: Brush },
      { label: 'Agenda', path: 'agenda', description: 'Agenda artística e técnica.', icon: CalendarDays },
      { label: 'Demandas Técnicas', path: 'demandas-tecnicas', description: 'Som, luz, palco e necessidades de produção.', icon: Wrench },
      { label: 'Contratos', path: 'contratos', description: 'Contratos e documentos previstos.', icon: FileText },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'novas-geracoes',
    name: 'Novas Gerações',
    shortName: 'Novas Gerações',
    description: 'Escolas, participantes, atividades, lanches, agenda e relatórios.',
    icon: GraduationCap,
    accentClass: visualThemes.sky.accentGradient,
    visual: visualThemes.sky,
    status: 'structuring',
    capability: 'novas_geracoes_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/novas-geracoes',
    order: 6,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Escolas', path: 'escolas', description: 'Escolas e instituições participantes.', icon: GraduationCap },
      { label: 'Participantes', path: 'participantes', description: 'Participantes e grupos acompanhados.', icon: UsersRound },
      { label: 'Atividades', path: 'atividades', description: 'Atividades previstas para o módulo.', icon: Sparkles },
      { label: 'Lanches', path: 'lanches', description: 'Controle futuro de lanches e apoio.', icon: UtensilsCrossed },
      { label: 'Agenda', path: 'agenda', description: 'Programação e horários.', icon: CalendarDays },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'seguranca',
    name: 'Segurança',
    shortName: 'Segurança',
    description: 'Escalas, ocorrências, pontos críticos, equipes e relatórios.',
    icon: ShieldCheck,
    accentClass: visualThemes.red.accentGradient,
    visual: visualThemes.red,
    status: 'structuring',
    capability: 'seguranca_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/seguranca',
    order: 7,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Escalas', path: 'escalas', description: 'Escalas e postos previstos.', icon: ClipboardList },
      { label: 'Ocorrências', path: 'ocorrencias', description: 'Registro e acompanhamento de ocorrências.', icon: FileText },
      { label: 'Pontos Críticos', path: 'pontos-criticos', description: 'Áreas sensíveis e pontos de atenção.', icon: MapPin },
      { label: 'Equipes', path: 'equipes', description: 'Equipes e responsáveis.', icon: UsersRound },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'limpeza',
    name: 'Limpeza',
    shortName: 'Limpeza',
    description: 'Rotinas, demandas, equipes, áreas, ocorrências e relatórios.',
    icon: Sparkles,
    accentClass: visualThemes.teal.accentGradient,
    visual: visualThemes.teal,
    status: 'structuring',
    capability: 'limpeza_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/limpeza',
    order: 8,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Rotinas', path: 'rotinas', description: 'Rotinas e ciclos de limpeza.', icon: CheckSquare },
      { label: 'Demandas', path: 'demandas', description: 'Demandas por área e prioridade.', icon: ClipboardList },
      { label: 'Equipes', path: 'equipes', description: 'Equipes, turnos e responsáveis.', icon: UsersRound },
      { label: 'Áreas', path: 'areas', description: 'Áreas atendidas e criticidade.', icon: MapPin },
      { label: 'Ocorrências', path: 'ocorrencias', description: 'Ocorrências e ajustes operacionais.', icon: FileText },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
  {
    slug: 'financeiro-gerencial',
    name: 'Financeiro Gerencial',
    shortName: 'Financeiro',
    description: 'Estrutura sensível para orçamento, receitas, despesas, patrocínios e simulações.',
    icon: BadgeDollarSign,
    accentClass: visualThemes.gold.accentGradient,
    visual: visualThemes.gold,
    status: 'restricted',
    capability: 'financial_access',
    sensitive: true,
    adminOnly: false,
    basePath: '/comissoes/financeiro-gerencial',
    order: 9,
    publicPortal: true,
    menus: [
      { ...dashboardMenu, label: 'Painel Financeiro', description: 'Visão executiva e estrutura restrita do módulo financeiro.' },
      { label: 'Receitas Projetadas', path: 'receitas-projetadas', description: 'Estrutura futura para receitas projetadas.', icon: ChartColumn },
      { label: 'Receitas Confirmadas', path: 'receitas-confirmadas', description: 'Estrutura futura para receitas confirmadas.', icon: Receipt },
      { label: 'Despesas Previstas', path: 'despesas-previstas', description: 'Estrutura futura para despesas previstas.', icon: ClipboardList },
      { label: 'Despesas Realizadas', path: 'despesas-realizadas', description: 'Estrutura futura para despesas realizadas.', icon: Receipt },
      { label: 'Orçamento por Comissão', path: 'orcamento-comissoes', description: 'Estrutura futura para orçamentos por comissão.', icon: BadgeDollarSign },
      { label: 'Patrocínios', path: 'patrocinios', description: 'Estrutura futura para patrocínios.', icon: Sparkles },
      { label: 'Simulações', path: 'simulacoes', description: 'Estrutura futura para simulações gerenciais.', icon: ChartColumn },
      { label: 'Relatórios', path: 'relatorios', description: 'Relatórios futuros do módulo.', icon: FileText },
    ],
  },
].sort((a, b) => a.order - b.order);

export const adminPortalCard = {
  slug: 'admin',
  name: 'Administrador',
  description: 'Visão consolidada, acompanhamento por comissão e navegação entre módulos.',
  icon: ShieldCheck,
  status: 'restricted' as CommissionStatus,
  basePath: '/admin',
  visual: visualThemes.gold,
};

export function getCommissionModule(slug?: string | null) {
  if (!slug) return undefined;
  return commissionModules.find((module) => module.slug === slug);
}

export function getPublicCommissionModules() {
  return commissionModules.filter((module) => module.publicPortal && !module.adminOnly);
}

export function getModuleRoute(module: CommissionModule, menuPath = 'dashboard') {
  const suffix = menuPath === 'dashboard' ? '/dashboard' : `/${menuPath}`;
  return `${module.basePath}${suffix}`;
}
