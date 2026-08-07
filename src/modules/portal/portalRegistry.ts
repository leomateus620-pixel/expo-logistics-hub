import {
  BadgeDollarSign,
  Building2,
  CalendarRange,
  MapPinned,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  getCommissionModule,
  getModuleRoute,
  getPublicCommissionModules,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';

export type PortalEntryId =
  | 'agenda-fenasoja'
  | 'agenda-restaurante-arena'
  | 'mapa-comercial'
  | 'comissoes'
  | 'financeiro';
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
  wordmark?: 'fenasoja' | 'venue';
  tone: 'agenda' | 'venue' | 'map' | 'commissions' | 'finance';
}


export const agendaFenasojaDestination: PortalDestination = {
  id: 'cronograma-eventos',
  title: 'Agenda Fenasoja',
  description: 'Planejamento, linha do tempo, calendário e execução do ciclo oficial.',
  icon: CalendarRange,
  capability: 'cronograma_eventos_access',
  loginPath: '/login/cronograma-eventos',
  route: '/cronograma-eventos',
  storageSlug: 'cronograma-eventos',
};

export const agendaVenueDestination: PortalDestination = {
  id: 'eventos-restaurante-arena',
  title: 'Agenda Restaurante e Arena',
  description: 'Reservas, aprovações, contrapartidas e operação dos espaços.',
  icon: Building2,
  capability: 'venue_events_access',
  loginPath: '/login/eventos-restaurante-arena',
  route: '/eventos-restaurante-arena',
  storageSlug: 'eventos-restaurante-arena',
};

export const portalAgendaDestinations: PortalDestination[] = [
  agendaFenasojaDestination,
  agendaVenueDestination,
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

const highlightedCommissionOrder = new Map([
  ['logistica', 0],
  ['exporural', 1],
  ['industria-comercio-servicos', 2],
]);

export const portalPrimaryEntries: PortalPrimaryEntry[] = [
  {
    id: 'agenda-fenasoja',
    kind: 'direct',
    title: agendaFenasojaDestination.title,
    description: agendaFenasojaDestination.description,
    icon: agendaFenasojaDestination.icon,
    wordmark: 'fenasoja',
    tone: 'agenda',
  },
  {
    id: 'agenda-restaurante-arena',
    kind: 'direct',
    title: agendaVenueDestination.title,
    description: agendaVenueDestination.description,
    icon: agendaVenueDestination.icon,
    wordmark: 'venue',
    tone: 'venue',
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
  return getPublicCommissionModules()
    .filter((module) => module.slug !== financePortalModule.slug)
    .sort((first, second) => {
      const firstPosition = highlightedCommissionOrder.get(first.slug);
      const secondPosition = highlightedCommissionOrder.get(second.slug);

      if (firstPosition !== undefined || secondPosition !== undefined) {
        return (firstPosition ?? Number.POSITIVE_INFINITY)
          - (secondPosition ?? Number.POSITIVE_INFINITY);
      }

      return first.order - second.order;
    });
}

export function getCommissionLoginPath(module: CommissionModule) {
  return `/login/${module.slug}`;
}

export function getCommissionDestination(module: CommissionModule) {
  return getModuleRoute(module);
}
