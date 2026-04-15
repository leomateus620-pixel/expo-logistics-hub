import { useMemo, useState } from 'react';
import { Download, Search, Shield, ShieldCheck, ShieldX, Users, Zap, Bike, QrCode } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMobilityForms } from '@/hooks/useMobilityForms';
import { useMobilityMembers } from '@/hooks/useMobilityMembers';
import { useOfficialCommittees } from '@/hooks/useOfficialCommittees';
import { toast } from 'sonner';
import StatCard from '@/components/StatCard';

const statusColors: Record<string, string> = {
  pendente: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  liberado: 'bg-green-500/10 text-green-600 border-green-500/20',
  bloqueado: 'bg-red-500/10 text-red-600 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', liberado: 'Liberado', bloqueado: 'Bloqueado',
};

export default function MobilityAdminPanel() {
  const { forms } = useMobilityForms();
  const { allMembers, allMembersLoading, updateMember } = useMobilityMembers();
  const { committees } = useOfficialCommittees();

  const [search, setSearch] = useState('');
  const [filterCommittee, setFilterCommittee] = useState('all');
  const [filterModal, setFilterModal] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = useMemo(() => {
    return allMembers.filter((m: any) => {
      if (search && !m.member_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCommittee !== 'all' && m.committee_id !== filterCommittee) return false;
      if (filterModal === 'car' && !m.access_electric_car) return false;
      if (filterModal === 'scooter' && !m.access_scooter) return false;
      if (filterStatus !== 'all' && m.access_status !== filterStatus) return false;
      return true;
    });
  }, [allMembers, search, filterCommittee, filterModal, filterStatus]);

  const stats = useMemo(() => {
    const submitted = forms.filter((f: any) => f.submission_status === 'enviado').length;
    const total = allMembers.length;
    const cars = allMembers.filter((m: any) => m.access_electric_car).length;
    const scooters = allMembers.filter((m: any) => m.access_scooter).length;
    const qr = allMembers.filter((m: any) => m.qr_access_free).length;
    return { submitted, total, cars, scooters, qr };
  }, [forms, allMembers]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateMember.mutateAsync({ id, access_status: newStatus });
      toast.success(`Status atualizado para ${statusLabels[newStatus]}`);
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const exportCSV = () => {
    const rows = filtered.map((m: any) => ({
      Nome: m.member_name,
      Cargo: m.member_role || '',
      Identificador: m.member_identifier || '',
      Comissão: m.committee_mobility_forms?.committee_name_snapshot || '',
      'Carro Elétrico': m.access_electric_car ? 'Sim' : 'Não',
      Patinete: m.access_scooter ? 'Sim' : 'Não',
      'QR Gratuito': m.qr_access_free ? 'Sim' : 'Não',
      Status: statusLabels[m.access_status] || m.access_status,
    }));
    if (rows.length === 0) { toast.error('Nenhum dado para exportar'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mobilidade_integrantes.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard title="Respondidas" value={stats.submitted} icon={<Shield className="w-4 h-4" />} />
        <StatCard title="Integrantes" value={stats.total} icon={<Users className="w-4 h-4" />} />
        <StatCard title="Carro Elétrico" value={stats.cars} icon={<Zap className="w-4 h-4" />} />
        <StatCard title="Patinete" value={stats.scooters} icon={<Bike className="w-4 h-4" />} />
        <StatCard title="QR Gratuito" value={stats.qr} icon={<QrCode className="w-4 h-4" />} />
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCommittee} onValueChange={setFilterCommittee}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Comissão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas comissões</SelectItem>
                {committees.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.committee_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterModal} onValueChange={setFilterModal}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Modal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="car">Carro Elétrico</SelectItem>
                <SelectItem value="scooter">Patinete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="liberado">Liberado</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={exportCSV} title="Exportar CSV">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {allMembersLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum integrante encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Comissão</TableHead>
                    <TableHead className="hidden md:table-cell">Cargo</TableHead>
                    <TableHead>Modal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.member_name}
                        {m.qr_access_free && <QrCode className="inline w-3.5 h-3.5 ml-1 text-primary" />}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                        {m.committee_mobility_forms?.committee_name_snapshot || '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                        {m.member_role || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {m.access_electric_car && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Carro</Badge>}
                          {m.access_scooter && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Patinete</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[m.access_status] || ''}>
                          {statusLabels[m.access_status] || m.access_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {m.access_status !== 'liberado' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => handleStatusChange(m.id, 'liberado')} title="Liberar">
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {m.access_status !== 'bloqueado' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleStatusChange(m.id, 'bloqueado')} title="Bloquear">
                              <ShieldX className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
