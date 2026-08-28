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
import { getOfficialUnitGroups } from '@/modules/commissions/officialCommissionCatalog';

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
}


export const agendaFenasojaDestination: PortalDestination = {
  id: 'cronograma-eventos',
  title: 'Agenda Fenasoja',
  description: 'Planejamento, calendário e execução do ciclo oficial.',
  icon: CalendarRange,
  capability: 'cronograma_eventos_access',
  loginPath: '/login/cronograma-eventos',
  route: '/cronograma-eventos',
  storageSlug: 'cronograma-eventos',
};

export const agendaVenueDestination: PortalDestination = {
  id: 'eventos-restaurante-arena',
  title: 'Agenda Restaurante e Arena',
  description: 'Reservas, aprovações e operação dos espaços.',
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
  },
  {
    id: 'agenda-restaurante-arena',
    kind: 'direct',
    title: agendaVenueDestination.title,
    description: agendaVenueDestination.description,
    icon: agendaVenueDestination.icon,
  },

  {
    id: 'mapa-comercial',
    kind: 'direct',
    title: commercialMapDestination.title,
    description: 'Lotes, pavilhões e disponibilidade comercial do parque.',
    icon: commercialMapDestination.icon,
  },
  {
    id: 'comissoes',
    kind: 'expandable',
    title: 'Comissões',
    description: 'Frentes responsáveis pela operação da Fenasoja.',
    icon: UsersRound,
  },
  {
    id: 'financeiro',
    kind: 'direct',
    title: 'Financeiro',
    description: 'Orçamento e gestão executiva conforme o perfil.',
    icon: BadgeDollarSign,
  },
];

export function getPortalCommissionGroups() {
  return getOfficialUnitGroups();
}

export function getPortalCommissionModules() {
  return getOfficialUnitGroups().flatMap((group) => group.items.map((item) => item.module));
}


export function getCommissionLoginPath(module: CommissionModule) {
  return `/login/${module.slug}`;
}

export function getCommissionDestination(module: CommissionModule) {
  return getModuleRoute(module);
}
