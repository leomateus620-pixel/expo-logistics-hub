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
  countLabel?: string;
  tone: 'agenda' | 'map' | 'commissions' | 'finance';
}

export const portalAgendaDestinations: PortalDestination[] = [
  {
    id: 'cronograma-eventos',
    title: 'Cronograma e Eventos',
    description: 'Planejamento, linha do tempo, calendário e execução do ciclo oficial.',
    icon: CalendarRange,
    capability: 'cronograma_eventos_access',
    loginPath: '/login/cronograma-eventos',
    route: '/cronograma-eventos',
    storageSlug: 'cronograma-eventos',
  },
  {
    id: 'eventos-restaurante-arena',
    title: 'Eventos Restaurante e Arena',
    description: 'Reservas, aprovações, contrapartidas e operação dos espaços.',
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
    description: 'Planejamento, calendário, reservas e operação dos eventos oficiais.',
    icon: Route,
    countLabel: `${portalAgendaDestinations.length} destinos`,
    tone: 'agenda',
  },
  {
    id: 'mapa-comercial',
    kind: 'direct',
    title: commercialMapDestination.title,
    description: 'Visão de lotes, pavilhões, espaços comerciais e disponibilidade do parque.',
    icon: commercialMapDestination.icon,
    tone: 'map',
  },
  {
    id: 'comissoes',
    kind: 'expandable',
    title: 'Comissões',
    description: 'Frentes responsáveis pela execução operacional da Fenasoja.',
    icon: UsersRound,
    countLabel: `${getPortalCommissionModules().length} frentes`,
    tone: 'commissions',
  },
  {
    id: 'financeiro',
    kind: 'direct',
    title: 'Financeiro',
    description: 'Gestão executiva, orçamento e informações restritas conforme o perfil.',
    icon: BadgeDollarSign,
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
