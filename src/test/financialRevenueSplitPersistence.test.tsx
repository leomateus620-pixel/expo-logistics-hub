import type { ReactNode } from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028RevenueComparison } from '@/features/financial-management/operational/Financial2028RevenueComparison';
import type { FinancialEditionSummary } from '@/features/financial-management/operational/financialOperationalApi';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/features/financial-management/operational/useFinancialExpenseCapabilities', () => ({ useFinancialExpenseCapabilities: () => ({ canAccess: true, canEdit: false, canConfirm: false, canAdmin: false, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/components/ui/resizable', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    ResizablePanelGroup: forwardRef<ImperativePanelGroupHandle, { children: ReactNode; onLayout: (sizes: number[]) => void }>(function SplitHarness({ children, onLayout }, ref) {
      useImperativeHandle(ref, () => ({ getId: () => 'test-group', getLayout: () => [50, 50], setLayout: onLayout }));
      return <div>{children}<button type="button" onClick={() => onLayout([65, 35])}>Ajustar divisão a 65%</button></div>;
    }),
    ResizablePanel: ({ children, defaultSize }: { children: ReactNode; defaultSize: number }) => <div data-default-split={defaultSize}>{children}</div>,
    ResizableHandle: () => <div role="separator" />,
  };
});

const REVENUE_KEY = 'financial-revenue-split-2028';
const EXPENSE_KEY = 'financial-expense-split-2028';
const edition = { id: 'qa-edition', org_id: 'qa-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional' as const, period_start: '2028-01-01', period_end: '2028-12-31' };
const summary: FinancialEditionSummary = {
  budget: { count: 0, cap_cents: 0, uncapped_count: 0, planned_cents: 0, line_count: 0 },
  revenues: { projected_cents: 0, confirmed_cents: 0, received_cents: 0, receivable_open_cents: 0, overdue_count: 0 },
  revenue: { count: 0, projected_cents: 0, confirmed_cents: 0 },
  sponsorship: { count: 0, declared_cents: 0, projected_cents: 0, confirmed_cents: 0, in_kind_cents: 0 },
  obligations: { received_cents: 0, paid_cents: 0, receivable_open_cents: 0, payable_open_cents: 0, overdue_count: 0 },
  movements: { count: 0, inflow_cents: 0, outflow_cents: 0 },
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(['financial-operational', 'summary', edition.id], summary);
  client.setQueryData(['financial-operational', 'revenues', edition.id], []);
  return render(<QueryClientProvider client={client}><Financial2028RevenueComparison edition={edition} focus="projetado" /></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(REVENUE_KEY, '50');
  localStorage.setItem(EXPENSE_KEY, '59');
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); });

describe('persistência da divisão de receitas em saída imediata', () => {
  it('salva o último layout no pagehide antes do debounce e conserva a divisão de despesas', () => {
    const result = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar divisão a 65%' }));
    expect(localStorage.getItem(REVENUE_KEY)).toBe('50');
    // A reload can arrive before the 180 ms debounce has run.
    fireEvent(window, new Event('pagehide'));
    expect(localStorage.getItem(REVENUE_KEY)).toBe('65');
    expect(localStorage.getItem(EXPENSE_KEY)).toBe('59');
    result.unmount();
    const restored = mount();
    expect(restored.container.querySelector('[data-default-split]')).toHaveAttribute('data-default-split', '65');
  });

  it('salva a última divisão ao desmontar antes do debounce, preservando a chave independente', () => {
    const result = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar divisão a 65%' }));
    expect(localStorage.getItem(REVENUE_KEY)).toBe('50');
    result.unmount();
    expect(localStorage.getItem(REVENUE_KEY)).toBe('65');
    expect(localStorage.getItem(EXPENSE_KEY)).toBe('59');
  });
});
