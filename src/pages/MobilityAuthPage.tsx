import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardList, ShieldCheck, Link2 } from 'lucide-react';
import MobilityForm from '@/components/mobility/MobilityForm';
import MobilityAdminPanel from '@/components/mobility/MobilityAdminPanel';
import MobilityLinksPanel from '@/components/mobility/MobilityLinksPanel';
import PageTransition from '@/components/PageTransition';

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
            <TabsTrigger value="links" className="gap-1.5">
              <Link2 className="w-4 h-4" /> Links
            </TabsTrigger>
          </TabsList>
          <TabsContent value="admin" className="mt-4">
            <MobilityAdminPanel />
          </TabsContent>
          <TabsContent value="form" className="mt-4">
            <MobilityForm onSuccess={() => setTab('admin')} />
          </TabsContent>
          <TabsContent value="links" className="mt-4">
            <MobilityLinksPanel />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
