import { useState } from 'react';
import { useMobilityAuthorizations } from '@/hooks/useMobilityAuthorizations';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileSpreadsheet, FileDown, ShieldCheck, ShieldX } from 'lucide-react';
// Badge import retained only for status badge below
import { toast } from 'sonner';
import { exportMobilityAuthorizationsCSV, exportMobilityAuthorizationsPDF } from '@/lib/generateMobilityAuthorizationsExport';

const statusLabels: Record<string, { label: string; class: string }> = {
  pendente: { label: 'Pendente', class: 'bg-warning/10 text-warning border-warning/20' },
  liberado: { label: 'Liberado', class: 'bg-success/10 text-success border-success/20' },
  bloqueado: { label: 'Bloqueado', class: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export default function AuthorizationsTab({ type }: { type: 'carro_eletrico' | 'patinete' }) {
  const { authorizations, isLoading, updateStatus } = useMobilityAuthorizations(type);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCommittee, setFilterCommittee] = useState('all');

  const committees = [...new Set(authorizations.map((a: any) => a.committee_name_snapshot))].sort();

  const filtered = authorizations.filter((a: any) => {
    if (filterStatus !== 'all' && a.access_status !== filterStatus) return false;
    if (filterCommittee !== 'all' && a.committee_name_snapshot !== filterCommittee) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.member_name.toLowerCase().includes(s) || a.committee_name_snapshot.toLowerCase().includes(s);
    }
    return true;
  });

  const handleToggle = async (id: string, current: string) => {
    const next = current === 'liberado' ? 'bloqueado' : 'liberado';
    try {
      await updateStatus.mutateAsync({ id, access_status: next });
      toast.success(next === 'liberado' ? 'Acesso liberado' : 'Acesso bloqueado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleExportCSV = () => {
    const count = exportMobilityAuthorizationsCSV(authorizations as any, type);
    if (count === 0) {
      toast.warning('Nenhuma solicitação aprovada para exportar.');
    } else {
      toast.success(`Exportadas ${count} autorizações aprovadas (CSV)`);
    }
  };

  const handleExportPDF = () => {
    try {
      const count = exportMobilityAuthorizationsPDF(authorizations as any, type);
      if (count === 0) {
        toast.warning('Nenhuma solicitação aprovada para exportar.');
      } else {
        toast.success(`Exportadas ${count} autorizações aprovadas (PDF)`);
      }
    } catch (err: any) {
      toast.error('Falha ao gerar PDF: ' + (err?.message || 'erro desconhecido'));
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome..." className="pl-9 h-10" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[150px] h-10"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="liberado">Liberado</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCommittee} onValueChange={setFilterCommittee}>
          <SelectTrigger className="w-full sm:w-[200px] h-10"><SelectValue placeholder="Comissão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {committees.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleExportCSV} className="h-10 gap-1.5 rounded-xl">
          <FileSpreadsheet className="w-4 h-4 text-success" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={handleExportPDF} className="h-10 gap-1.5 rounded-xl">
          <FileDown className="w-4 h-4 text-gold" /> PDF
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Nenhuma autorização encontrada.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Comissão</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Cargo</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Responsável Op.</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-center p-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => {
                  const st = statusLabels[a.access_status] || statusLabels.pendente;
                  return (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-medium">{a.member_name}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{a.committee_name_snapshot}</p>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-muted-foreground">{a.committee_name_snapshot}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{a.member_role || '—'}</td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground">{a.operational_responsible_name || '—'}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={`text-[10px] ${st.class}`}>{st.label}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggle(a.id, a.access_status)}
                          disabled={updateStatus.isPending}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center mx-auto"
                          title={a.access_status === 'liberado' ? 'Bloquear' : 'Liberar'}
                        >
                          {a.access_status === 'liberado' ?
                            <ShieldX className="w-4 h-4 text-destructive" /> :
                            <ShieldCheck className="w-4 h-4 text-success" />
                          }
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{filtered.length} de {authorizations.length} autorizações</p>
    </div>
  );
}
