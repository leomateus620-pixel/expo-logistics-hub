import { BadgeDollarSign, ClipboardList, Package, Settings2, ShoppingBag, Truck, Users, Wallet, Warehouse } from 'lucide-react';
import type { CommissionMenuItem } from '@/modules/commissions/commissionRegistry';
import type { SojaStoreAccess, SojaStoreCapability } from './hooks/useSojaStoreAccess';

export const SOJA_STORE_UNIT = 'soja-store';
export const SOJA_STORE_IMPORTS_PATH = 'importacoes';

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
  vendas: {
    label: 'Vendas',
    description: 'Vendas próprias e entregas.',
    icon: ShoppingBag,
    group: 'Operação',
    quickLabel: 'Vendas',
    capability: 'sales.checkout',
  },
  caixa: {
    label: 'Caixa',
    description: 'Abertura, conferência e fechamento por ponto de atendimento.',
    icon: Wallet,
    group: 'Operação',
    capability: 'cash.view',
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
  clientes: {
    label: 'Clientes e apoiadores',
    description: 'Cadastros de atendimento e interesses.',
    icon: Users,
    group: 'Gestão',
    capability: 'customers.view',
  },
  financeiro: {
    label: 'Financeiro da loja',
    description: 'Orçamento e compromissos da Soja Store.',
    icon: BadgeDollarSign,
    group: 'Gestão',
    capability: 'finance.view',
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
  vendas: 'vendas',
  caixa: 'caixa',
  fornecedores: 'fornecedores',
  compras: 'compras',
  clientes: 'clientes',
  financeiro: 'financeiro',
  configuracoes: 'configuracoes',
};

export const SOJA_STORE_WORKSPACE_PATHS = {
  ...SOJA_STORE_SECTION_PATHS,
  importacoes: SOJA_STORE_IMPORTS_PATH,
} as const;

export function canOpenSojaStoreSection(access: SojaStoreAccess | undefined, section: SojaStoreSection): boolean {
  return access?.enabled === true && access.capabilities.includes(SOJA_STORE_SECTIONS[section].capability);
}

export function buildSojaStoreMenu(baseMenu: CommissionMenuItem[], access: SojaStoreAccess | undefined): CommissionMenuItem[] {
  const storeMenu = storeSections.filter((section) => canOpenSojaStoreSection(access, section));
  if (storeMenu.length === 0) return baseMenu;
  const checkout = storeMenu.includes('vendas');

  const overview = baseMenu.filter((item) => item.path === 'dashboard');
  const team = baseMenu.find((item) => item.path === 'equipe');
  const commission = baseMenu.filter((item) => item.path !== 'dashboard' && item.path !== 'equipe');
  const sections = storeMenu.map((section) => ({
    ...SOJA_STORE_SECTIONS[section],
    ...(checkout && section === 'produtos' ? { quickLabel: undefined } : {}),
    path: SOJA_STORE_SECTION_PATHS[section],
  }));

  return [
    ...overview.map((item) => ({ ...item, quickLabel: 'Visão geral' })),
    ...sections.filter((item) => item.group === 'Operação'),
    ...sections.filter((item) => item.group === 'Gestão' && item.path !== 'configuracoes'),
    ...(team ? [{ ...team, group: 'Gestão' }] : []),
    ...sections.filter((item) => item.path === 'configuracoes'),
    ...commission.map((item) => ({ ...item, group: 'Comissão' })),
  ];
}
