import { useVehicles } from '@/hooks/useVehicles';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicleUsage } from '@/hooks/useVehicleUsage';
import { useTransports } from '@/hooks/useTransports';
import { useFuelRecords } from '@/hooks/useFuelRecords';
import { useAuth } from '@/hooks/useAuth';
import {
  Car, Pencil, Plus, Gauge, Fuel, ArrowRight, Clock, ExternalLink,
  Camera, Image, FileText, ChevronRight, Wrench, CircleDot, AlertTriangle,
  TrendingUp, DollarSign, Activity, Upload, Eye, Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, nowSP } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const FUEL_COST_PER_KM = 0.65;

const statusConfig: Record<string, { label: string; icon: typeof Car; badgeCls: string }> = {
  disponivel: { label: 'Disponível', icon: CircleDot, badgeCls: 'bg-success/15 text-success border-success/25' },
  em_uso: { label: 'Em uso', icon: Activity, badgeCls: 'bg-info/15 text-info border-info/25' },
  manutencao: { label: 'Manutenção', icon: Wrench, badgeCls: 'bg-warning/15 text-warning border-warning/25' },
  inativo: { label: 'Inativo', icon: AlertTriangle, badgeCls: 'bg-muted text-muted-foreground border-border' },
};

function formatCurrency(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatKm(val: number) {
  return val.toLocaleString('pt-BR');
}

// PDF generation via print window
function generateVehiclePDF(vehicle: any, usages: any[], fuelRecords: any[], kmTotal: number, members: any[]) {
  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';
  const custoEstimado = kmTotal * FUEL_COST_PER_KM;
  const custoReal = fuelRecords.reduce((s: number, f: any) => s + (Number(f.valor) || 0), 0);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório - ${vehicle.placa}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:32px;color:#1a1a1a;max-width:800px;margin:0 auto}
  h1{color:#2d6a4f;font-size:22px;margin-bottom:4px}
  .sub{color:#666;font-size:13px;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
  .metric{background:#f0f7f4;border:1px solid #d4e8dc;border-radius:8px;padding:12px}
  .metric-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}
  .metric-value{font-size:18px;font-weight:700;color:#2d6a4f;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
  th{background:#2d6a4f;color:white;padding:8px 10px;text-align:left;font-weight:600}
  td{padding:7px 10px;border-bottom:1px solid #e8e8e8}
  tr:nth-child(even){background:#f8f8f8}
  h2{color:#2d6a4f;font-size:16px;margin-top:28px;margin-bottom:8px;border-bottom:2px solid #d4e8dc;padding-bottom:4px}
  .footer{margin-top:32px;text-align:center;font-size:10px;color:#999}
  @media print{body{padding:16px}}
</style></head><body>
<h1>🚗 ${vehicle.marca || ''} ${vehicle.modelo || ''} ${vehicle.cor ? '— ' + vehicle.cor.toUpperCase() : ''}</h1>
<p class="sub">Placa: <strong>${vehicle.placa}</strong> | Odômetro: ${formatKm(Number(vehicle.km_atual || 0))} km | Status: ${statusConfig[vehicle.status]?.label || vehicle.status}</p>
<div class="grid">
  <div class="metric"><div class="metric-label">KM Rodados</div><div class="metric-value">${formatKm(kmTotal)} km</div></div>
  <div class="metric"><div class="metric-label">Custo Estimado</div><div class="metric-value">${formatCurrency(custoEstimado)}</div></div>
  <div class="metric"><div class="metric-label">Custo Real (Abastecimentos)</div><div class="metric-value">${formatCurrency(custoReal)}</div></div>
  <div class="metric"><div class="metric-label">Total Usos</div><div class="metric-value">${usages.length}</div></div>
</div>
<h2>Histórico de Utilização</h2>
${usages.length === 0 ? '<p style="color:#999;font-size:12px">Nenhum uso registrado</p>' : `
<table><thead><tr><th>Data</th><th>Responsável</th><th>KM Saída</th><th>KM Chegada</th><th>KM Rodados</th><th>Custo Est.</th></tr></thead><tbody>
${usages.map((u: any) => `<tr>
  <td>${new Date(u.retirada_em).toLocaleDateString('pt-BR')}</td>
  <td>${getMemberName(u.responsavel_user_id)}</td>
  <td>${formatKm(Number(u.km_saida))}</td>
  <td>${u.km_chegada ? formatKm(Number(u.km_chegada)) : '—'}</td>
  <td>${u.km_rodados ? formatKm(Number(u.km_rodados)) : '—'}</td>
  <td>${u.km_rodados ? formatCurrency(Number(u.km_rodados) * FUEL_COST_PER_KM) : '—'}</td>
</tr>`).join('')}
</tbody></table>`}
<h2>Abastecimentos</h2>
${fuelRecords.length === 0 ? '<p style="color:#999;font-size:12px">Nenhum abastecimento registrado</p>' : `
<table><thead><tr><th>Data</th><th>Litros</th><th>Valor</th><th>KM</th><th>Posto</th></tr></thead><tbody>
${fuelRecords.map((f: any) => `<tr>
  <td>${new Date(f.created_at).toLocaleDateString('pt-BR')}</td>
  <td>${f.litros ? Number(f.litros).toLocaleString('pt-BR') + ' L' : '—'}</td>
  <td>${f.valor ? formatCurrency(Number(f.valor)) : '—'}</td>
  <td>${f.km_abastecimento ? formatKm(Number(f.km_abastecimento)) + ' km' : '—'}</td>
  <td>${f.posto || '—'}</td>
</tr>`).join('')}
</tbody></table>`}
<div class="footer">Fenasoja Logística — Relatório gerado em ${new Date().toLocaleString('pt-BR')}</div>
</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

export default function VehiclesPage() {
  const { vehicles, isLoading: vehiclesLoading, create, update } = useVehicles();
  const { members } = useOrgMembers();
  const { user } = useAuth();
  const { usages, totalKm, kmByVehicle, isLoading: usageLoading } = useVehicleUsage();
  const { records: allFuelRecords, isLoading: fuelLoading } = useFuelRecords();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ placa: '', marca: '', modelo: '', ano: '', cor: '', categoria: 'outro', km_atual: '' });
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ placa: '', marca: '', modelo: '', cor: '', status: 'disponivel', km_atual: '', responsavel_user_id: '' });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const isLoading = vehiclesLoading || usageLoading || fuelLoading;

  // Derive effective status from open usages
  const effectiveStatus = useMemo(() => {
    const map: Record<string, string> = {};
    vehicles.forEach((v: any) => {
      const hasOpenUsage = usages.some((u: any) => u.vehicle_id === v.id && !u.km_chegada);
      map[v.id] = hasOpenUsage ? 'em_uso' : v.status;
    });
    return map;
  }, [vehicles, usages]);

  // Aggregated metrics
  const metrics = useMemo(() => {
    const custoEstimado = totalKm * FUEL_COST_PER_KM;
    const custoReal = allFuelRecords.reduce((s: number, f: any) => s + (Number(f.valor) || 0), 0);
    const disponivel = vehicles.filter((v: any) => effectiveStatus[v.id] === 'disponivel').length;
    const emUso = vehicles.filter((v: any) => effectiveStatus[v.id] === 'em_uso').length;
    const manutencao = vehicles.filter((v: any) => effectiveStatus[v.id] === 'manutencao').length;
    return { custoEstimado, custoReal, disponivel, emUso, manutencao };
  }, [vehicles, totalKm, allFuelRecords, effectiveStatus]);

  // Fuel records by vehicle
  const fuelByVehicle = useMemo(() => {
    const map: Record<string, number> = {};
    allFuelRecords.forEach((f: any) => {
      map[f.vehicle_id] = (map[f.vehicle_id] || 0) + (Number(f.valor) || 0);
    });
    return map;
  }, [allFuelRecords]);

  const filteredVehicles = useMemo(() => {
    if (statusFilter === 'todos') return vehicles;
    return vehicles.filter((v: any) => effectiveStatus[v.id] === statusFilter);
  }, [vehicles, statusFilter, effectiveStatus]);

  const openEdit = (v: any) => {
    setEditId(v.id);
    setEditForm({ placa: v.placa, marca: v.marca || '', modelo: v.modelo || '', cor: v.cor || '', status: v.status, km_atual: String(v.km_atual || ''), responsavel_user_id: v.responsavel_user_id || '' });
    setEditOpen(true);
  };

  const handleAdd = async () => {
    if (!addForm.placa) return;
    try {
      await create.mutateAsync({
        placa: addForm.placa.toUpperCase(),
        marca: addForm.marca || null,
        modelo: addForm.modelo || null,
        ano: addForm.ano ? Number(addForm.ano) : null,
        cor: addForm.cor || null,
        categoria: addForm.categoria,
        km_atual: addForm.km_atual ? Number(addForm.km_atual) : 0,
      });
      setAddForm({ placa: '', marca: '', modelo: '', ano: '', cor: '', categoria: 'outro', km_atual: '' });
      setAddOpen(false);
      toast.success('Veículo adicionado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar');
    }
  };

  const handleEdit = async () => {
    try {
      await update.mutateAsync({
        id: editId,
        placa: editForm.placa.toUpperCase(),
        marca: editForm.marca || null,
        modelo: editForm.modelo || null,
        cor: editForm.cor || null,
        status: editForm.status,
        km_atual: editForm.km_atual ? Number(editForm.km_atual) : 0,
        responsavel_user_id: editForm.responsavel_user_id && editForm.responsavel_user_id !== 'none' ? editForm.responsavel_user_id : null,
      });
      setEditOpen(false);
      toast.success('Veículo atualizado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar');
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Veículos Botolli</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão da frota • {vehicles.length} veículo{vehicles.length !== 1 ? 's' : ''}</p>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="h-10 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform"
        >
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {/* KPI Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl liquid-glass-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { icon: <Gauge className="w-4 h-4" />, label: "KM Rodados", value: `${formatKm(totalKm)} km`, variant: "primary" as const },
            { icon: <TrendingUp className="w-4 h-4" />, label: "Custo Estimado", value: formatCurrency(metrics.custoEstimado), sub: "R$ 0,65/km", variant: "accent" as const },
            { icon: <DollarSign className="w-4 h-4" />, label: "Custo Real", value: formatCurrency(metrics.custoReal), sub: "Abastecimentos", variant: "warning" as const },
            { icon: <Car className="w-4 h-4" />, label: "Disponíveis", value: String(metrics.disponivel), sub: `${metrics.emUso} em uso`, variant: "success" as const },
            { icon: <Wrench className="w-4 h-4" />, label: "Manutenção", value: String(metrics.manutencao), variant: "default" as const },
          ].map((kpi, i) => (
            <div key={kpi.label} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}>
              <KpiCard {...kpi} />
            </div>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'disponivel', label: 'Disponíveis' },
          { value: 'em_uso', label: 'Em uso' },
          { value: 'manutencao', label: 'Manutenção' },
          { value: 'inativo', label: 'Inativos' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
              statusFilter === f.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'liquid-glass-card text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Vehicle Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-2xl liquid-glass-card" />
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="liquid-glass-card rounded-2xl p-12 text-center">
          <Car className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {statusFilter !== 'todos' ? 'Nenhum veículo com esse status' : 'Nenhum veículo cadastrado'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {statusFilter !== 'todos' ? 'Tente outro filtro' : 'Clique em "Adicionar" para começar'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredVehicles.map((v: any, i: number) => {
            const driver = members.find((m: any) => m.user_id === v.responsavel_user_id);
            const vStatus = effectiveStatus[v.id] || v.status;
            const sc = statusConfig[vStatus] || statusConfig.disponivel;
            const vehicleKm = kmByVehicle[v.id] || 0;
            const vehicleFuelCost = fuelByVehicle[v.id] || 0;
            return (
              <div
                key={v.id}
                className="liquid-glass-card rounded-2xl p-4 cursor-pointer active:scale-[0.98] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
                onClick={() => { setDetailVehicle(v); setDetailOpen(true); }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
                      <Car className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {v.marca} {v.modelo} {v.cor ? v.cor.toUpperCase() : ''}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">{v.placa}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                      aria-label={`Editar ${v.placa}`}
                      className="p-2 rounded-xl hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground min-w-[40px] min-h-[40px] flex items-center justify-center"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className={cn('text-[10px] font-medium', sc.badgeCls)}>
                    {sc.label}
                  </Badge>
                  {driver && (
                    <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-primary-foreground shrink-0" style={{ backgroundColor: driver.avatar_color || 'hsl(142,50%,35%)' }}>
                        {(driver.nome_exibicao || '?')[0]}
                      </div>
                      {driver.nome_exibicao}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-foreground/[0.03] p-2">
                    <p className="text-[10px] text-muted-foreground">Odômetro</p>
                    <p className="text-xs font-bold text-foreground">{formatKm(Number(v.km_atual || 0))}</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-2">
                    <p className="text-[10px] text-muted-foreground">KM Rodados</p>
                    <p className="text-xs font-bold text-foreground">{formatKm(vehicleKm)}</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-2">
                    <p className="text-[10px] text-muted-foreground">Custo Est.</p>
                    <p className="text-xs font-bold text-foreground">{vehicleKm > 0 ? formatCurrency(vehicleKm * FUEL_COST_PER_KM) : '—'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end mt-3 text-xs text-primary font-medium">
                  <span className="flex items-center gap-1">Detalhes <ChevronRight className="w-3 h-3" /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Veículo</DialogTitle>
            <DialogDescription>Cadastre um novo veículo na frota</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Placa (ex: ABC-1D23)" value={addForm.placa} onChange={(e) => setAddForm({ ...addForm, placa: e.target.value })} className="h-11" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Marca" value={addForm.marca} onChange={(e) => setAddForm({ ...addForm, marca: e.target.value })} className="h-11" />
              <Input placeholder="Modelo" value={addForm.modelo} onChange={(e) => setAddForm({ ...addForm, modelo: e.target.value })} className="h-11" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Ano" type="number" value={addForm.ano} onChange={(e) => setAddForm({ ...addForm, ano: e.target.value })} className="h-11" />
              <Input placeholder="Cor" value={addForm.cor} onChange={(e) => setAddForm({ ...addForm, cor: e.target.value })} className="h-11" />
              <Input placeholder="KM atual" type="number" value={addForm.km_atual} onChange={(e) => setAddForm({ ...addForm, km_atual: e.target.value })} className="h-11" />
            </div>
            <Button onClick={handleAdd} className="w-full h-11 rounded-xl font-semibold active:scale-[0.97] transition-all" disabled={create.isPending}>
              {create.isPending ? 'Adicionando...' : 'Adicionar Veículo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Veículo</DialogTitle>
            <DialogDescription>Atualize as informações do veículo</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Placa" value={editForm.placa} onChange={(e) => setEditForm({ ...editForm, placa: e.target.value })} className="h-11" />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Marca" value={editForm.marca} onChange={(e) => setEditForm({ ...editForm, marca: e.target.value })} className="h-11" />
              <Input placeholder="Modelo" value={editForm.modelo} onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })} className="h-11" />
            </div>
            <Input placeholder="Cor" value={editForm.cor} onChange={(e) => setEditForm({ ...editForm, cor: e.target.value })} className="h-11" />
            <Input placeholder="KM atual" type="number" value={editForm.km_atual} onChange={(e) => setEditForm({ ...editForm, km_atual: e.target.value })} className="h-11" />
            <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em uso</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={editForm.responsavel_user_id} onValueChange={(v) => setEditForm({ ...editForm, responsavel_user_id: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members.map((m: any) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao} - {m.cargo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleEdit} className="w-full h-11 rounded-xl font-semibold active:scale-[0.97] transition-all" disabled={update.isPending}>
              {update.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail — centered Dialog */}
      <VehicleDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        vehicle={detailVehicle}
        effectiveStatus={effectiveStatus}
        members={members}
        userId={user?.id}
        kmByVehicle={kmByVehicle}
        fuelByVehicle={fuelByVehicle}
      />
    </div>
  );
}

// KPI Card component
function KpiCard({ icon, label, value, sub, variant = 'default' }: { icon: React.ReactNode; label: string; value: string; sub?: string; variant?: string }) {
  const iconBg: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-gold/10 text-gold',
    warning: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
    default: 'bg-muted/60 text-muted-foreground',
  };
  const borderAccent: Record<string, string> = {
    primary: 'stat-accent-primary',
    accent: 'stat-accent-accent',
    warning: 'stat-accent-warning',
    success: 'stat-accent-success',
    default: '',
  };
  return (
    <div className={cn("liquid-glass-card rounded-2xl p-4", borderAccent[variant] || '')}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', iconBg[variant] || iconBg.default)}>
          {icon}
        </div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
      </div>
      <p className="text-xl font-extrabold tracking-tight text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Centered detail modal — Dialog for both mobile and desktop
function VehicleDetailModal({ open, onOpenChange, vehicle, effectiveStatus, members, userId, kmByVehicle, fuelByVehicle }: {
  open: boolean; onOpenChange: (v: boolean) => void; vehicle: any; effectiveStatus: Record<string, string>;
  members: any[]; userId?: string; kmByVehicle: Record<string, number>; fuelByVehicle: Record<string, number>;
}) {
  if (!vehicle) return null;

  const vStatus = effectiveStatus[vehicle.id] || vehicle.status;
  const sc = statusConfig[vStatus] || statusConfig.disponivel;
  const kmTotal = kmByVehicle[vehicle.id] || 0;
  const fuelCostTotal = fuelByVehicle[vehicle.id] || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-[min(96vw,32rem)] max-h-[85dvh]">
        <DialogHeader className="p-5 pb-3 shrink-0 border-b border-border/20">
          <DialogTitle className="sr-only">{vehicle.marca} {vehicle.modelo} — {vehicle.placa}</DialogTitle>
          <DialogDescription className="sr-only">Detalhes do veículo</DialogDescription>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-foreground truncate">{vehicle.marca} {vehicle.modelo}</span>
                <Badge variant="outline" className={cn('text-[10px] font-medium shrink-0', sc.badgeCls)}>{sc.label}</Badge>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{vehicle.placa} {vehicle.cor ? `• ${vehicle.cor.toUpperCase()}` : ''}</p>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth px-5 pb-5">
          <VehicleDetailContent
            vehicle={vehicle}
            members={members}
            userId={userId}
            kmTotal={kmTotal}
            fuelCostTotal={fuelCostTotal}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VehicleDetailContent({ vehicle, members, userId, kmTotal, fuelCostTotal }: {
  vehicle: any; members: any[]; userId?: string; kmTotal: number; fuelCostTotal: number;
}) {
  const { usages, createUsage, updateUsage } = useVehicleUsage(vehicle.id);
  const { transports } = useTransports();
  const { update: updateVehicle, uploadDocument, getDocumentUrl } = useVehicles();
  const { records: fuelRecords, create: createFuel, updateFuel, uploadReceipt } = useFuelRecords(vehicle.id);
  const navigate = useNavigate();

  const [kmSaida, setKmSaida] = useState('');
  const [kmChegada, setKmChegada] = useState('');
  const [responsavelId, setResponsavelId] = useState(userId || '');
  const [obs, setObs] = useState('');
  const [activeTab, setActiveTab] = useState<'uso' | 'combustivel'>('uso');

  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelForm, setFuelForm] = useState({ litros: '', valor: '', km_abastecimento: '', posto: '', observacoes: '' });
  const [fuelPhoto, setFuelPhoto] = useState<File | null>(null);
  const [fuelPhotoPreview, setFuelPhotoPreview] = useState<string | null>(null);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [editFuelId, setEditFuelId] = useState<string | null>(null);
  const [editFuelForm, setEditFuelForm] = useState({ litros: '', valor: '', km_abastecimento: '', posto: '', observacoes: '' });
  const [docUploading, setDocUploading] = useState(false);

  const openFuelEdit = (f: any) => {
    setEditFuelId(f.id);
    setEditFuelForm({
      litros: f.litros != null ? String(f.litros) : '',
      valor: f.valor != null ? String(f.valor) : '',
      km_abastecimento: f.km_abastecimento != null ? String(f.km_abastecimento) : '',
      posto: f.posto || '',
      observacoes: f.observacoes || '',
    });
  };

  const handleFuelEdit = async () => {
    if (!editFuelId) return;
    setFuelLoading(true);
    try {
      await updateFuel.mutateAsync({
        id: editFuelId,
        litros: editFuelForm.litros ? Number(editFuelForm.litros) : null,
        valor: editFuelForm.valor ? Number(editFuelForm.valor) : null,
        km_abastecimento: editFuelForm.km_abastecimento ? Number(editFuelForm.km_abastecimento) : null,
        posto: editFuelForm.posto || null,
        observacoes: editFuelForm.observacoes || null,
      });
      setEditFuelId(null);
      toast.success('Abastecimento atualizado');
    } catch (err: any) { toast.error(err.message); }
    setFuelLoading(false);
  };

  const openUsage = usages.find((u: any) => !u.km_chegada);

  const handleRetirada = async () => {
    if (!kmSaida) { toast.error('Informe o KM de saída'); return; }
    try {
      await createUsage.mutateAsync({
        vehicle_id: vehicle.id,
        responsavel_user_id: responsavelId && responsavelId !== 'none' ? responsavelId : null,
        km_saida: Number(kmSaida),
        observacoes: obs || null,
      });
      await updateVehicle.mutateAsync({
        id: vehicle.id,
        status: 'em_uso',
        km_atual: Number(kmSaida),
        responsavel_user_id: responsavelId && responsavelId !== 'none' ? responsavelId : null,
      });
      setKmSaida('');
      setObs('');
      toast.success('Retirada registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDevolucao = async (usageId: string) => {
    if (!kmChegada) { toast.error('Informe o KM de chegada'); return; }
    const usage = usages.find((u: any) => u.id === usageId);
    if (usage && Number(kmChegada) < Number(usage.km_saida)) {
      toast.error('KM de chegada não pode ser menor que KM de saída');
      return;
    }
    try {
      await updateUsage.mutateAsync({
        id: usageId,
        km_chegada: Number(kmChegada),
        devolucao_em: nowSP(),
      });
      await updateVehicle.mutateAsync({ id: vehicle.id, km_atual: Number(kmChegada), status: 'disponivel', responsavel_user_id: null });
      setKmChegada('');
      toast.success('Devolução registrada');
    } catch (err: any) { toast.error(err.message); }
  };

  const getMemberName = (uid: string) => members.find((m: any) => m.user_id === uid)?.nome_exibicao || '—';

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const calcDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff <= 0) return '—';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h${mins > 0 ? `${mins}min` : ''}` : `${mins}min`;
  };

  const findTransport = (usage: any) => {
    return transports.find((t: any) =>
      t.vehicle_id === vehicle.id &&
      t.status === 'concluido' &&
      t.km_retirada != null &&
      Number(t.km_retirada) === Number(usage.km_saida)
    );
  };

  const handleGeneratePDF = () => {
    generateVehiclePDF(vehicle, usages, fuelRecords, kmTotal, members);
  };

  return (
    <div className="space-y-4">
      {/* Vehicle metrics summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Gauge className="w-3 h-3 text-primary" />
            <p className="text-[10px] text-muted-foreground font-medium">Odômetro</p>
          </div>
          <p className="text-sm font-bold text-foreground">{formatKm(Number(vehicle.km_atual || 0))} km</p>
        </div>
        <div className="rounded-xl bg-accent/5 border border-accent/10 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-accent" />
            <p className="text-[10px] text-muted-foreground font-medium">KM Rodados</p>
          </div>
          <p className="text-sm font-bold text-foreground">{formatKm(kmTotal)} km</p>
        </div>
        <div className="rounded-xl bg-warning/5 border border-warning/10 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <DollarSign className="w-3 h-3 text-warning" />
            <p className="text-[10px] text-muted-foreground font-medium">Custo Real</p>
          </div>
          <p className="text-sm font-bold text-foreground">{fuelCostTotal > 0 ? formatCurrency(fuelCostTotal) : '—'}</p>
        </div>
      </div>

      {/* PDF button */}
      <Button variant="outline" size="sm" onClick={handleGeneratePDF} className="w-full h-9 text-xs liquid-glass-card">
        <FileText className="w-3.5 h-3.5 mr-1.5" /> Gerar Relatório PDF
      </Button>

      {/* Document upload */}
      <div className="rounded-xl liquid-glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Documento do Veículo</p>
            <p className="text-[10px] text-muted-foreground">CRLV, Seguro ou outro documento em PDF</p>
          </div>
        </div>

        {vehicle.documento_url ? (
          <div className="flex items-center gap-2">
            <a
              href={vehicle.documento_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Ver documento PDF
            </a>
            <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-dashed border-muted-foreground/30 text-xs text-muted-foreground cursor-pointer hover:bg-foreground/5 transition-colors">
              <Upload className="w-3.5 h-3.5" />
              Substituir
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.type !== 'application/pdf') { toast.error('Apenas arquivos PDF são aceitos'); return; }
                  setDocUploading(true);
                  try {
                    const url = await uploadDocument(f, vehicle.id);
                    await updateVehicle.mutateAsync({ id: vehicle.id, documento_url: url });
                    toast.success('Documento atualizado');
                  } catch (err: any) { toast.error(err.message || 'Erro ao enviar'); }
                  setDocUploading(false);
                }}
              />
            </label>
          </div>
        ) : (
          <label className={cn(
            "flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-primary/25 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors",
            docUploading && "opacity-60 pointer-events-none"
          )}>
            <Upload className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs font-medium text-foreground">{docUploading ? 'Enviando...' : 'Enviar documento PDF'}</p>
              <p className="text-[10px] text-muted-foreground">Clique para selecionar o arquivo</p>
            </div>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.type !== 'application/pdf') { toast.error('Apenas arquivos PDF são aceitos'); return; }
                setDocUploading(true);
                try {
                  const url = await uploadDocument(f, vehicle.id);
                  await updateVehicle.mutateAsync({ id: vehicle.id, documento_url: url });
                  toast.success('Documento enviado com sucesso');
                } catch (err: any) { toast.error(err.message || 'Erro ao enviar'); }
                setDocUploading(false);
              }}
            />
          </label>
        )}
      </div>

      {/* Retirada / Devolução */}
      {openUsage ? (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-info/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-info" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Veículo em uso</p>
              <p className="text-[10px] text-muted-foreground">Registre a devolução abaixo</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/60 p-2">
              <p className="text-[10px] text-muted-foreground">Responsável</p>
              <p className="font-medium text-foreground">{getMemberName(openUsage.responsavel_user_id)}</p>
            </div>
            <div className="rounded-lg bg-background/60 p-2">
              <p className="text-[10px] text-muted-foreground">KM saída</p>
              <p className="font-medium text-foreground">{Number(openUsage.km_saida).toLocaleString('pt-BR')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input placeholder="KM chegada (obrigatório)" type="number" value={kmChegada} onChange={(e) => setKmChegada(e.target.value)} className="h-11" />
          </div>
          <Button size="sm" onClick={() => handleDevolucao(openUsage.id)} disabled={updateUsage.isPending} className="w-full h-10 bg-success hover:bg-success/90 text-success-foreground">
            {updateUsage.isPending ? 'Registrando...' : '✓ Registrar Devolução'}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl liquid-glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Car className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Registrar Retirada</p>
              <p className="text-[10px] text-muted-foreground">Preencha os dados para retirar o veículo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input placeholder="KM saída" type="number" value={kmSaida} onChange={(e) => setKmSaida(e.target.value)} className="h-11" />
          </div>
          <Select value={responsavelId} onValueChange={setResponsavelId}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {members.map((m: any) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Observações (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} className="h-11" />
          <Button size="sm" onClick={handleRetirada} disabled={createUsage.isPending} className="w-full h-10">
            {createUsage.isPending ? 'Registrando...' : 'Registrar Retirada'}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/40">
        <button
          className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5', activeTab === 'uso' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
          onClick={() => setActiveTab('uso')}
        >
          Utilização <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{usages.length}</Badge>
        </button>
        <button
          className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5', activeTab === 'combustivel' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
          onClick={() => setActiveTab('combustivel')}
        >
          Combustível <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{fuelRecords.length}</Badge>
        </button>
      </div>

      {/* Usage history tab */}
      {activeTab === 'uso' && (
        <div>
          {usages.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nenhum uso registrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {usages.map((u: any) => {
                const matchedTransport = u.km_chegada ? findTransport(u) : null;
                return (
                  <div
                    key={u.id}
                    className={cn(
                      'rounded-xl liquid-glass-card p-3 text-xs space-y-1.5',
                      matchedTransport ? 'cursor-pointer active:scale-[0.98]' : ''
                    )}
                    onClick={() => { if (matchedTransport) navigate('/transports'); }}
                  >
                  <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{getMemberName(u.responsavel_user_id)}</span>
                      <div className="flex items-center gap-1.5">
                        {matchedTransport && <ExternalLink className="w-3 h-3 text-primary" />}
                        <Badge variant="outline" className={cn('text-[10px]', u.km_chegada ? 'bg-success/10 text-success border-success/20' : 'bg-info/10 text-info border-info/20')}>
                          {u.km_chegada ? 'Devolvido' : 'Em uso'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(u.retirada_em)}</span>
                      {u.devolucao_em && (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          <span>{formatDateTime(u.devolucao_em)}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto">{calcDuration(u.retirada_em, u.devolucao_em)}</Badge>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>Saída: {Number(u.km_saida).toLocaleString('pt-BR')} km</span>
                      {u.km_chegada && (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          <span>Chegada: {Number(u.km_chegada).toLocaleString('pt-BR')} km</span>
                          <span className="font-semibold text-foreground ml-auto">
                            {Number(u.km_rodados).toLocaleString('pt-BR')} km
                          </span>
                        </>
                      )}
                    </div>
                    {matchedTransport && (
                      <div className="text-primary text-[10px] flex items-center gap-1">
                        <Car className="w-3 h-3" />
                        {matchedTransport.titulo || `${matchedTransport.origem} → ${matchedTransport.destino}`}
                      </div>
                    )}
                    {u.observacoes && <p className="text-muted-foreground italic">{u.observacoes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fuel tab */}
      {activeTab === 'combustivel' && (
        <div>
          <div className="flex items-center justify-end mb-3">
            <Button size="sm" variant="outline" className="h-8 text-xs liquid-glass-card" onClick={() => setFuelOpen(!fuelOpen)}>
              {fuelOpen ? 'Cancelar' : '+ Registrar'}
            </Button>
          </div>

          {fuelOpen && (
            <div className="rounded-xl liquid-glass-card p-3.5 space-y-2.5 mb-3">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Litros" type="number" step="0.01" value={fuelForm.litros} onChange={(e) => setFuelForm({ ...fuelForm, litros: e.target.value })} className="h-11" />
                <Input placeholder="Valor (R$)" type="number" step="0.01" value={fuelForm.valor} onChange={(e) => setFuelForm({ ...fuelForm, valor: e.target.value })} className="h-11" />
              </div>
              <Input placeholder="KM no abastecimento" type="number" value={fuelForm.km_abastecimento} onChange={(e) => setFuelForm({ ...fuelForm, km_abastecimento: e.target.value })} className="h-11" />
              <Input placeholder="Posto / Local" value={fuelForm.posto} onChange={(e) => setFuelForm({ ...fuelForm, posto: e.target.value })} className="h-11" />
              <Input placeholder="Observações (opcional)" value={fuelForm.observacoes} onChange={(e) => setFuelForm({ ...fuelForm, observacoes: e.target.value })} className="h-11" />

              <label className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors">
                <Camera className="w-5 h-5 text-primary" />
                <span className="text-xs text-muted-foreground">{fuelPhoto ? fuelPhoto.name : 'Anexar cupom fiscal (foto)'}</span>
                <input
                  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setFuelPhoto(f); setFuelPhotoPreview(URL.createObjectURL(f)); }
                  }}
                />
              </label>
              {fuelPhotoPreview && (
                <div className="relative">
                  <img src={fuelPhotoPreview} alt="Preview cupom" className="w-full max-h-40 object-contain rounded-xl border" />
                  <button className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs" onClick={() => { setFuelPhoto(null); setFuelPhotoPreview(null); }}>×</button>
                </div>
              )}

              <Button
                size="sm" className="w-full h-10" disabled={fuelLoading}
                onClick={async () => {
                  if (!fuelForm.litros && !fuelForm.valor) { toast.error('Informe litros ou valor'); return; }
                  setFuelLoading(true);
                  try {
                    let cupomUrl: string | null = null;
                    if (fuelPhoto) cupomUrl = await uploadReceipt(fuelPhoto, vehicle.id);
                    await createFuel.mutateAsync({
                      vehicle_id: vehicle.id,
                      litros: fuelForm.litros ? Number(fuelForm.litros) : null,
                      valor: fuelForm.valor ? Number(fuelForm.valor) : null,
                      km_abastecimento: fuelForm.km_abastecimento ? Number(fuelForm.km_abastecimento) : null,
                      posto: fuelForm.posto || null,
                      observacoes: fuelForm.observacoes || null,
                      cupom_fiscal_url: cupomUrl,
                      registrado_por_user_id: userId || null,
                    });
                    setFuelForm({ litros: '', valor: '', km_abastecimento: '', posto: '', observacoes: '' });
                    setFuelPhoto(null); setFuelPhotoPreview(null); setFuelOpen(false);
                    toast.success('Abastecimento registrado');
                  } catch (err: any) { toast.error(err.message); }
                  setFuelLoading(false);
                }}
              >
                {fuelLoading ? 'Registrando...' : 'Registrar Abastecimento'}
              </Button>
            </div>
          )}

          {fuelRecords.length === 0 && !fuelOpen ? (
            <div className="text-center py-8">
              <Fuel className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nenhum abastecimento registrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fuelRecords.map((f: any) => {
                const who = members.find((m: any) => m.user_id === f.registrado_por_user_id);
                const isEditing = editFuelId === f.id;
                return (
                  <div key={f.id} className="rounded-xl liquid-glass-card p-3 text-xs space-y-1.5">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Litros" type="number" step="0.01" value={editFuelForm.litros} onChange={(e) => setEditFuelForm({ ...editFuelForm, litros: e.target.value })} />
                          <Input placeholder="Valor (R$)" type="number" step="0.01" value={editFuelForm.valor} onChange={(e) => setEditFuelForm({ ...editFuelForm, valor: e.target.value })} />
                        </div>
                        <Input placeholder="KM" type="number" value={editFuelForm.km_abastecimento} onChange={(e) => setEditFuelForm({ ...editFuelForm, km_abastecimento: e.target.value })} />
                        <Input placeholder="Posto" value={editFuelForm.posto} onChange={(e) => setEditFuelForm({ ...editFuelForm, posto: e.target.value })} />
                        <Input placeholder="Observações" value={editFuelForm.observacoes} onChange={(e) => setEditFuelForm({ ...editFuelForm, observacoes: e.target.value })} />
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={handleFuelEdit} disabled={fuelLoading}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditFuelId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{who?.nome_exibicao || '—'}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openFuelEdit(f)} className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors" aria-label="Editar">
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <span className="text-muted-foreground">{new Date(f.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                          {f.litros && <span><Fuel className="w-3 h-3 inline mr-0.5" />{Number(f.litros).toLocaleString('pt-BR')} L</span>}
                          {f.valor && <span className="font-semibold text-foreground">R$ {Number(f.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                          {f.km_abastecimento && <span><Gauge className="w-3 h-3 inline mr-0.5" />{Number(f.km_abastecimento).toLocaleString('pt-BR')} km</span>}
                          {f.posto && <span>{f.posto}</span>}
                        </div>
                        {f.observacoes && <p className="text-muted-foreground italic">{f.observacoes}</p>}
                        {f.cupom_fiscal_url && (
                          <a href={f.cupom_fiscal_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-[10px]">
                            <Image className="w-3 h-3" /> Ver cupom fiscal
                          </a>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
