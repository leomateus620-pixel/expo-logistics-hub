import {
  BadgeDollarSign,
  Building2,
  CalendarRange,
  MapPinned,
  Route,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  getCommissionModule,
  getModuleRoute,
  getPublicCommissionModules,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';

export type PortalEntryId = 'agenda' | 'mapa-comercial' | 'comissoes' | 'financeiro';
export type PortalEntryKind = 'expandable' | 'direct';

export interface PortalDestination {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  capability: string;
  loginPath: string;
  route: string;
  storageSlug: string;
}

export interface PortalPrimaryEntry {
  id: PortalEntryId;
  kind: PortalEntryKind;
  title: string;
  description: string;
  icon: LucideIcon;
  eyebrow: string;
  tone: 'agenda' | 'map' | 'commissions' | 'finance';
}

export const portalAgendaDestinations: PortalDestination[] = [
  {
    id: 'cronograma-eventos',
    title: 'Cronograma e Eventos',
    description: 'Planejamento central, linha do tempo, calendário, reuniões e ações do ciclo oficial.',
    icon: CalendarRange,
    capability: 'cronograma_eventos_access',
    loginPath: '/login/cronograma-eventos',
    route: '/cronograma-eventos',
    storageSlug: 'cronograma-eventos',
  },
  {
    id: 'eventos-restaurante-arena',
    title: 'Eventos Restaurante e Arena',
    description: 'Reservas, aprovações, contrapartidas, eventos e recursos operacionais dos espaços.',
    icon: Building2,
    capability: 'venue_events_access',
    loginPath: '/login/eventos-restaurante-arena',
    route: '/eventos-restaurante-arena',
    storageSlug: 'eventos-restaurante-arena',
  },
];

export const commercialMapDestination: PortalDestination = {
  id: 'mapa-comercial',
  title: 'Mapa Comercial',
  description: 'Gestão visual dos lotes, pavilhões, espaços comerciais e disponibilidade do parque.',
  icon: MapPinned,
  capability: 'map.view',
  loginPath: '/login/mapa-comercial',
  route: '/mapa-comercial',
  storageSlug: 'mapa-comercial',
};

const financeModule = getCommissionModule('financeiro-gerencial');

if (!financeModule) {
  throw new Error('O módulo Financeiro Gerencial precisa permanecer registrado no portal.');
}

export const financePortalModule: CommissionModule = financeModule;

export const portalPrimaryEntries: PortalPrimaryEntry[] = [
  {
    id: 'agenda',
    kind: 'expandable',
    title: 'Agenda',
    description: 'Planejamento, eventos institucionais, reservas e operação dos espaços.',
    icon: Route,
    eyebrow: `${portalAgendaDestinations.length} destinos`,
    tone: 'agenda',
  },
  {
    id: 'mapa-comercial',
    kind: 'direct',
    title: commercialMapDestination.title,
    description: commercialMapDestination.description,
    icon: commercialMapDestination.icon,
    eyebrow: 'Acesso direto',
    tone: 'map',
  },
  {
    id: 'comissoes',
    kind: 'expandable',
    title: 'Comissões',
    description: 'Acesso às frentes operacionais responsáveis pela execução da Fenasoja.',
    icon: UsersRound,
    eyebrow: `${getPortalCommissionModules().length} frentes`,
    tone: 'commissions',
  },
  {
    id: 'financeiro',
    kind: 'direct',
    title: 'Financeiro',
    description: 'Gestão financeira gerencial e informações restritas conforme o perfil.',
    icon: BadgeDollarSign,
    eyebrow: 'Acesso restrito',
    tone: 'finance',
  },
];

export function getPortalCommissionModules() {
  return getPublicCommissionModules().filter((module) => module.slug !== financePortalModule.slug);
}

export function getCommissionLoginPath(module: CommissionModule) {
  return `/login/${module.slug}`;
}

export function getCommissionDestination(module: CommissionModule) {
  return getModuleRoute(module);
}
