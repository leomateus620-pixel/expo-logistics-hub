import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/styles/tokens.css';
import '@/index.css';
import CommissionLayout from '@/components/commissions/CommissionLayout';
import FinancialManagementPage from '@/pages/commissions/FinancialManagementPage';
import { getCommissionModule } from '@/modules/commissions/commissionRegistry';
import { Toaster } from '@/components/ui/toaster';

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const module = getCommissionModule('financeiro-gerencial')!;
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><BrowserRouter><CommissionLayout module={module}>
    <FinancialManagementPage module={module} />
    <Toaster />
  </CommissionLayout></BrowserRouter></QueryClientProvider>,
);
