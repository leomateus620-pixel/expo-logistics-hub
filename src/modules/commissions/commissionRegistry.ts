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

export interface CommissionMenuItem {
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
}

export interface CommissionModule {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  accentClass: string;
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
  structuring: 'Em estruturacao',
  restricted: 'Restrito',
};

export const statusClasses: Record<CommissionStatus, string> = {
  active: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  structuring: 'border-gold/25 bg-gold/10 text-gold',
  restricted: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
};

const dashboardMenu = {
  label: 'Dashboard',
  path: 'dashboard',
  description: 'Visao inicial e acompanhamento do modulo.',
  icon: LayoutDashboard,
};

export const commissionModules: CommissionModule[] = [
  {
    slug: 'logistica',
    name: 'Logistica',
    shortName: 'Logistica',
    description: 'Transportes, frota, carrinhos, agenda, hospedes e operacao da mobilidade.',
    icon: Truck,
    accentClass: 'from-emerald-500/20 via-gold/10 to-transparent',
    status: 'active',
    capability: 'logistica_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/logistica',
    order: 1,
    publicPortal: true,
    legacyRoutes: [
      '/',
      '/transports',
      '/vehicles',
      '/electric-carts',
      '/guests',
      '/agenda',
      '/checklist',
      '/team',
      '/expenses',
      '/system-report',
    ],
    menus: [
      dashboardMenu,
      {
        label: 'Transportes',
        path: 'transportes',
        description: 'Solicitacoes, corridas e deslocamentos.',
        icon: MapPin,
      },
      {
        label: 'Veiculos',
        path: 'veiculos',
        description: 'Frota, disponibilidade e manutencoes.',
        icon: Truck,
      },
      {
        label: 'Carrinhos Eletricos',
        path: 'carrinhos-eletricos',
        description: 'Operacao e reservas dos carrinhos eletricos.',
        icon: Zap,
      },
      {
        label: 'Hospedes',
        path: 'hospedes',
        description: 'Rede hoteleira e apoio aos convidados.',
        icon: Hotel,
      },
      {
        label: 'Agenda',
        path: 'agenda',
        description: 'Eventos, compromissos e programacao.',
        icon: CalendarDays,
      },
      {
        label: 'Checklist',
        path: 'checklist',
        description: 'Tarefas operacionais e pendencias.',
        icon: CheckSquare,
      },
      {
        label: 'Equipe',
        path: 'equipe',
        description: 'Pessoas, escala e disponibilidade.',
        icon: Users,
      },
      {
        label: 'Despesas',
        path: 'despesas',
        description: 'Registros e comprovantes operacionais.',
        icon: Receipt,
      },
      {
        label: 'Relatorio',
        path: 'relatorio',
        description: 'Relatorios e consolidacao do modulo.',
        icon: FileText,
      },
    ],
  },
  {
    slug: 'gastronomia',
    name: 'Gastronomia',
    shortName: 'Gastronomia',
    description: 'Fichas, refeicoes, consumo por comissao, estoque e devolucoes.',
    icon: UtensilsCrossed,
    accentClass: 'from-amber-500/20 via-emerald-500/10 to-transparent',
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
      { label: 'Refeicoes', path: 'refeicoes', description: 'Planejamento e acompanhamento de refeicoes.', icon: UtensilsCrossed },
      { label: 'Consumo', path: 'consumo', description: 'Consumo por comissao e periodo.', icon: ChartColumn },
      { label: 'Estoque', path: 'estoque', description: 'Itens, entradas e saldos previstos.', icon: Package },
      { label: 'Devolucoes', path: 'devolucoes', description: 'Fluxo de retorno e conferencia.', icon: RefreshCcw },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'infraestrutura',
    name: 'Infraestrutura',
    shortName: 'Infraestrutura',
    description: 'Obras, materiais, demandas, equipes, fornecedores e avanco fisico.',
    icon: HardHat,
    accentClass: 'from-lime-500/20 via-gold/10 to-transparent',
    status: 'structuring',
    capability: 'infraestrutura_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/infraestrutura',
    order: 3,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Obras', path: 'obras', description: 'Frentes de obra e execucao prevista.', icon: Construction },
      { label: 'Materiais', path: 'materiais', description: 'Materiais solicitados, recebidos e aplicados.', icon: Package },
      { label: 'Demandas', path: 'demandas', description: 'Demandas por area e prioridade.', icon: ClipboardList },
      { label: 'Equipes', path: 'equipes', description: 'Equipes internas e alocacoes.', icon: UsersRound },
      { label: 'Fornecedores', path: 'fornecedores', description: 'Base de fornecedores e contatos.', icon: Wrench },
      { label: 'Avanco Fisico', path: 'avanco-fisico', description: 'Percentuais e marcos de execucao.', icon: ChartColumn },
      { label: 'Anexos', path: 'anexos', description: 'Fotos, documentos e evidencias.', icon: FileText },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'servicos',
    name: 'Servicos',
    shortName: 'Servicos',
    description: 'Chamados, demandas, equipes, status e ocorrencias operacionais.',
    icon: Wrench,
    accentClass: 'from-cyan-500/20 via-emerald-500/10 to-transparent',
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
      { label: 'Demandas', path: 'demandas', description: 'Demandas por prioridade e responsavel.', icon: CheckSquare },
      { label: 'Equipes', path: 'equipes', description: 'Equipes e escalas de atendimento.', icon: UsersRound },
      { label: 'Status', path: 'status', description: 'Quadro de situacao dos servicos.', icon: ChartColumn },
      { label: 'Ocorrencias', path: 'ocorrencias', description: 'Registro de ocorrencias operacionais.', icon: FileText },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'arte-cultura',
    name: 'Arte e Cultura',
    shortName: 'Arte e Cultura',
    description: 'Atracoes, artistas, palcos, agenda, demandas tecnicas e contratos.',
    icon: Palette,
    accentClass: 'from-rose-500/20 via-gold/10 to-transparent',
    status: 'structuring',
    capability: 'arte_cultura_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/arte-cultura',
    order: 5,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Atracoes', path: 'atracoes', description: 'Atracoes e programacao artistica.', icon: Sparkles },
      { label: 'Artistas', path: 'artistas', description: 'Cadastro e acompanhamento de artistas.', icon: UsersRound },
      { label: 'Palcos', path: 'palcos', description: 'Palcos, locais e estruturas.', icon: Brush },
      { label: 'Agenda', path: 'agenda', description: 'Agenda artistica e tecnica.', icon: CalendarDays },
      { label: 'Demandas Tecnicas', path: 'demandas-tecnicas', description: 'Som, luz, montagem e necessidades tecnicas.', icon: Wrench },
      { label: 'Contratos', path: 'contratos', description: 'Contratos e documentos previstos.', icon: FileText },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'novas-geracoes',
    name: 'Novas Geracoes',
    shortName: 'Novas Geracoes',
    description: 'Escolas, participantes, atividades, lanches, agenda e relatorios.',
    icon: UsersRound,
    accentClass: 'from-sky-500/20 via-emerald-500/10 to-transparent',
    status: 'structuring',
    capability: 'novas_geracoes_access',
    sensitive: false,
    adminOnly: false,
    basePath: '/comissoes/novas-geracoes',
    order: 6,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Escolas', path: 'escolas', description: 'Escolas e instituicoes participantes.', icon: Hotel },
      { label: 'Participantes', path: 'participantes', description: 'Participantes e grupos acompanhados.', icon: UsersRound },
      { label: 'Atividades', path: 'atividades', description: 'Atividades previstas para o modulo.', icon: Sparkles },
      { label: 'Lanches', path: 'lanches', description: 'Controle futuro de lanches e apoio.', icon: UtensilsCrossed },
      { label: 'Agenda', path: 'agenda', description: 'Programacao e horarios.', icon: CalendarDays },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'seguranca',
    name: 'Seguranca',
    shortName: 'Seguranca',
    description: 'Escalas, ocorrencias, pontos criticos, equipes e relatorios.',
    icon: ShieldCheck,
    accentClass: 'from-red-500/20 via-gold/10 to-transparent',
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
      { label: 'Ocorrencias', path: 'ocorrencias', description: 'Registro e acompanhamento de ocorrencias.', icon: FileText },
      { label: 'Pontos Criticos', path: 'pontos-criticos', description: 'Areas sensiveis e pontos de atencao.', icon: MapPin },
      { label: 'Equipes', path: 'equipes', description: 'Equipes e responsaveis.', icon: UsersRound },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'limpeza',
    name: 'Limpeza',
    shortName: 'Limpeza',
    description: 'Rotinas, demandas, equipes, areas, ocorrencias e relatorios.',
    icon: Sparkles,
    accentClass: 'from-teal-500/20 via-gold/10 to-transparent',
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
      { label: 'Demandas', path: 'demandas', description: 'Demandas por area e prioridade.', icon: ClipboardList },
      { label: 'Equipes', path: 'equipes', description: 'Equipes, turnos e responsaveis.', icon: UsersRound },
      { label: 'Areas', path: 'areas', description: 'Areas atendidas e criticidade.', icon: MapPin },
      { label: 'Ocorrencias', path: 'ocorrencias', description: 'Ocorrencias e ajustes operacionais.', icon: FileText },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
  {
    slug: 'financeiro-gerencial',
    name: 'Financeiro Gerencial',
    shortName: 'Financeiro',
    description: 'Estrutura sensivel para orcamento, receitas, despesas, patrocinio e simulacoes.',
    icon: BadgeDollarSign,
    accentClass: 'from-yellow-500/20 via-red-500/10 to-transparent',
    status: 'restricted',
    capability: 'financial_access',
    sensitive: true,
    adminOnly: false,
    basePath: '/comissoes/financeiro-gerencial',
    order: 9,
    publicPortal: true,
    menus: [
      dashboardMenu,
      { label: 'Receitas Projetadas', path: 'receitas-projetadas', description: 'Estrutura futura para receitas projetadas.', icon: ChartColumn },
      { label: 'Receitas Confirmadas', path: 'receitas-confirmadas', description: 'Estrutura futura para receitas confirmadas.', icon: Receipt },
      { label: 'Despesas Previstas', path: 'despesas-previstas', description: 'Estrutura futura para despesas previstas.', icon: ClipboardList },
      { label: 'Despesas Realizadas', path: 'despesas-realizadas', description: 'Estrutura futura para despesas realizadas.', icon: Receipt },
      { label: 'Orcamento Comissoes', path: 'orcamento-comissoes', description: 'Estrutura futura para orcamentos por comissao.', icon: BadgeDollarSign },
      { label: 'Patrocinios', path: 'patrocinios', description: 'Estrutura futura para patrocinios.', icon: Sparkles },
      { label: 'Simulacoes', path: 'simulacoes', description: 'Estrutura futura para simulacoes gerenciais.', icon: ChartColumn },
      { label: 'Relatorios', path: 'relatorios', description: 'Relatorios futuros do modulo.', icon: FileText },
    ],
  },
].sort((a, b) => a.order - b.order);

export const adminPortalCard = {
  slug: 'admin',
  name: 'Administrador',
  description: 'Visao consolidada, acompanhamento por comissao e navegacao entre modulos.',
  icon: ShieldCheck,
  status: 'restricted' as CommissionStatus,
  basePath: '/admin',
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
