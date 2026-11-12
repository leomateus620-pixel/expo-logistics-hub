import { ClipboardList, FileUp, Package, Settings2, Truck, Warehouse } from 'lucide-react';
import type { CommissionMenuItem } from '@/modules/commissions/commissionRegistry';
import type { SojaStoreAccess, SojaStoreCapability } from './hooks/useSojaStoreAccess';

export const SOJA_STORE_UNIT = 'soja-store';

export const SOJA_STORE_SECTIONS = {
  produtos: {
    label: 'Produtos',
    description: 'Catálogo e variantes.',
    icon: Package,
    group: 'Operação',
    quickLabel: 'Produtos',
    capability: 'catalog.view',
  },
  estoque: {
    label: 'Estoque',
    description: 'Saldos físicos e movimentos por local e variante.',
    icon: Warehouse,
    group: 'Operação',
    quickLabel: 'Estoque',
    capability: 'stock.view',
  },
  fornecedores: {
    label: 'Fornecedores',
    description: 'Cadastro de fornecedores da loja.',
    icon: Truck,
    group: 'Gestão',
    capability: 'suppliers.view',
  },
  compras: {
    label: 'Compras',
    description: 'Pedidos de compra e conferência de recebimentos.',
    icon: ClipboardList,
    group: 'Gestão',
    capability: 'purchases.view',
  },
  importacoes: {
    label: 'Importações',
    description: 'Conferência de fontes e registros em preparação.',
    icon: FileUp,
    group: 'Gestão',
    capability: 'imports.view',
  },
  configuracoes: {
    label: 'Configurações',
    description: 'Locais e preparação da operação.',
    icon: Settings2,
    group: 'Gestão',
    capability: 'settings.view',
  },
} satisfies Record<string, Omit<CommissionMenuItem, 'path'> & { capability: SojaStoreCapability }>;

export type SojaStoreSection = keyof typeof SOJA_STORE_SECTIONS;

const storeSections = Object.keys(SOJA_STORE_SECTIONS) as SojaStoreSection[];
export const SOJA_STORE_SECTION_PATHS: Readonly<Record<SojaStoreSection, string>> = {
  produtos: 'produtos',
  estoque: 'estoque',
  fornecedores: 'fornecedores',
  compras: 'compras',
  importacoes: 'importacoes',
  configuracoes: 'configuracoes',
};

export function canOpenSojaStoreSection(access: SojaStoreAccess | undefined, section: SojaStoreSection): boolean {
  return access?.enabled === true && access.capabilities.includes(SOJA_STORE_SECTIONS[section].capability);
}

export function buildSojaStoreMenu(baseMenu: CommissionMenuItem[], access: SojaStoreAccess | undefined): CommissionMenuItem[] {
  const storeMenu = storeSections.filter((section) => canOpenSojaStoreSection(access, section));
  if (storeMenu.length === 0) return baseMenu;

  const overview = baseMenu.filter((item) => item.path === 'dashboard');
  const commission = baseMenu.filter((item) => item.path !== 'dashboard');

  return [
    ...overview.map((item) => ({ ...item, quickLabel: 'Visão geral' })),
    ...storeMenu.map((section) => ({ ...SOJA_STORE_SECTIONS[section], path: SOJA_STORE_SECTION_PATHS[section] })),
    ...commission.map((item) => ({ ...item, group: 'Comissão' })),
  ];
}
