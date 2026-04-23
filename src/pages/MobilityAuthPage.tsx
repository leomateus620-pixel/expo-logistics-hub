import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import MobilityForm from '@/components/mobility/MobilityForm';
import MobilityAdminPanel from '@/components/mobility/MobilityAdminPanel';
import PageTransition from '@/components/PageTransition';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function MobilityAuthPage() {
  const [tab, setTab] = useState('admin');

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mobilidade por Comissão</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autorização de carros elétricos e patinetes por comissão oficial
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="admin" className="gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Painel
            </TabsTrigger>
            <TabsTrigger value="form" className="gap-1.5">
              <ClipboardList className="w-4 h-4" /> Nova Solicitação
            </TabsTrigger>
          </TabsList>
          <TabsContent value="admin" className="mt-4">
            <ErrorBoundary fallbackTitle="Não foi possível carregar o painel de mobilidade">
              <MobilityAdminPanel />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="form" className="mt-4">
            <ErrorBoundary fallbackTitle="Não foi possível carregar o formulário de nova solicitação">
              <MobilityForm onSuccess={() => setTab('admin')} />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
