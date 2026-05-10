import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTransports } from '@/hooks/useTransports';
import { useTransportGuests } from '@/hooks/useTransportGuests';
import { useGuests } from '@/hooks/useGuests';
import { useVehicles } from '@/hooks/useVehicles';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { consolidateTransports, FAIR_PERIODS, type ConsolidationResult, type KmSource } from '@/lib/kmConsolidation';
import { generateKmPdf } from '@/lib/generateKmPdf';
import { useVehicleOdometerEvent } from '@/hooks/useVehicleOdometerEvent';
import {
  FileDown, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  Car, Users, MapPin, Calendar, Gauge, TrendingUp, Info,
} from 'lucide-react';
import { rawDateShort } from '@/lib/utils';

const KM_SOURCE_BADGE: Record<KmSource, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  saved: { label: 'KM salvo', variant: 'default' },
  known_route: { label: 'Rota conhecida', variant: 'secondary' },
  insufficient: { label: 'Base insuficiente', variant: 'destructive' },
};

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-warning/15 text-warning',
  em_andamento: 'bg-info/15 text-info',
  concluido: 'bg-success/15 text-success',
  cancelado: 'bg-destructive/15 text-destructive',
};

function fmtKm(km: number | null): string {
  return km != null ? `${km.toLocaleString('pt-BR')} km` : '—';
}

export default function KmEmissoesPage() {
  const { transports, isLoading: tLoading } = useTransports();
  const { transportGuests, isLoading: tgLoading } = useTransportGuests();
  const { guests, isLoading: gLoading } = useGuests();
  const { vehicles, isLoading: vLoading } = useVehicles();
  const { members, isLoading: mLoading } = useOrgMembers();
  const odometer = useVehicleOdometerEvent();

  const isLoading = tLoading || tgLoading || gLoading || vLoading || mLoading;

  const data: ConsolidationResult = useMemo(() => {
    if (isLoading) {
      return { transports: [], periods: [], totalKmConfirmed: 0, totalKmPending: 0, totalTransports: 0, totalVehicles: 0, totalGuests: 0, vehicleSummaries: [], guestSummaries: [], inconsistencies: [] };
    }
    return consolidateTransports(transports, transportGuests, guests, vehicles, members);
  }, [transports, transportGuests, guests, vehicles, members, isLoading]);

  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'transports' | 'vehicles' | 'guests' | 'issues'>('overview');

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Gauge className="w-7 h-7 text-primary" />
            Quilometragem & Emissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Consolidação de KM operacional por período, base para cálculo de emissão de carbono.
            Dados de Transportes, Veículos e Hóspedes.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Info className="w-3.5 h-3.5 text-warning" />
            <span className="text-xs text-muted-foreground">Apenas dados com base confiável entram no total consolidado.</span>
          </div>
        </div>
        <Button onClick={() => generateKmPdf(data, { items: odometer.items, totalKmEvento: odometer.totalKmEvento, totalValorCombustivel: odometer.totalValorCombustivel, totalLitros: odometer.totalLitros, totalCustoEstimadoKm: odometer.totalCustoEstimadoKm })} className="gap-2 shrink-0">
          <FileDown className="w-4 h-4" />
          Gerar PDF
        </Button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {([
          { id: 'overview', label: 'Visão Geral' },
          { id: 'daily', label: 'Por Dia' },
          { id: 'transports', label: 'Por Transporte' },
          { id: 'vehicles', label: 'Por Veículo' },
          { id: 'guests', label: 'Por Hóspede' },
          { id: 'issues', label: `Pendências (${data.inconsistencies.length})` },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Period Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.periods.map(ps => (
              <Card key={ps.period.id} className="liquid-glass-card gold-accent">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{ps.period.label}</CardTitle>
                  <CardDescription>
                    {fmtDate(ps.period.start)} a {fmtDate(ps.period.end)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <StatItem icon={<Gauge className="w-4 h-4 text-primary" />} label="KM Confirmado" value={fmtKm(ps.totalKmConfirmed)} />
                    <StatItem icon={<TrendingUp className="w-4 h-4 text-warning" />} label="KM Previsto" value={fmtKm(ps.totalKmPending)} />
                    <StatItem icon={<MapPin className="w-4 h-4 text-info" />} label="Transportes" value={String(ps.transportCount)} />
                    <StatItem icon={<CheckCircle2 className="w-4 h-4 text-success" />} label="Confirmados" value={String(ps.transportConfirmed)} />
                    <StatItem icon={<Car className="w-4 h-4 text-muted-foreground" />} label="Veículos" value={String(ps.vehicleCount)} />
                    <StatItem icon={<Users className="w-4 h-4 text-accent" />} label="Hóspedes" value={String(ps.guestCount)} />
                  </div>
                  {ps.inconsistentCount > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {ps.inconsistentCount} transporte(s) com pendência
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* General Summary */}
          <Card className="liquid-glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Resumo Geral da Feira</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <BigStat label="KM Confirmados" value={fmtKm(data.totalKmConfirmed)} accent="primary" />
                <BigStat label="KM Previstos" value={fmtKm(data.totalKmPending)} accent="warning" />
                <BigStat label="Transportes" value={String(data.totalTransports)} accent="info" />
                <BigStat label="Veículos" value={String(data.totalVehicles)} accent="muted-foreground" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <BigStat label="Hóspedes" value={String(data.totalGuests)} accent="accent" />
                <BigStat label="Inconsistências" value={String(data.inconsistencies.length)} accent="destructive" />
                <BigStat label="Período 1 KM" value={fmtKm(data.periods[0]?.totalKmConfirmed || 0)} accent="success" />
                <BigStat label="Período 2 KM" value={fmtKm(data.periods[1]?.totalKmConfirmed || 0)} accent="success" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── DAILY TAB ── */}
      {activeTab === 'daily' && (
        <div className="space-y-2">
          {data.periods.map(ps => (
            <div key={ps.period.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {ps.period.label}
              </h3>
              {ps.days.map(d => (
                <Collapsible key={d.date} open={expandedDays.has(d.date)} onOpenChange={() => toggleDay(d.date)}>
                  <Card className="liquid-glass-card">
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-between px-4 py-3 text-left">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{fmtDate(d.date)}</span>
                          <Badge variant="secondary" className="text-xs">{d.transportCount} transp.</Badge>
                          {d.kmConfirmed > 0 && <span className="text-xs text-success font-medium">{fmtKm(d.kmConfirmed)}</span>}
                          {d.inconsistentCount > 0 && (
                            <span className="text-xs text-warning flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />{d.inconsistentCount}
                            </span>
                          )}
                        </div>
                        {expandedDays.has(d.date) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {d.transports.length > 0 ? (
                        <div className="px-4 pb-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Rota</TableHead>
                                <TableHead>Veículo</TableHead>
                                <TableHead>KM</TableHead>
                                <TableHead>Fonte</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {d.transports.map(t => (
                                <TableRow key={t.id}>
                                  <TableCell className="font-medium text-xs">{t.origem} → {t.destino}</TableCell>
                                  <TableCell className="text-xs">{t.vehicleName || '—'}</TableCell>
                                  <TableCell className="text-xs">{fmtKm(t.km)}</TableCell>
                                  <TableCell><Badge variant={KM_SOURCE_BADGE[t.kmSource].variant} className="text-[10px]">{KM_SOURCE_BADGE[t.kmSource].label}</Badge></TableCell>
                                  <TableCell><span className={`status-badge ${STATUS_COLORS[t.status] || ''}`}>{t.status}</span></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="px-4 pb-3 text-sm text-muted-foreground">Nenhum transporte neste dia.</p>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── TRANSPORTS TAB ── */}
      {activeTab === 'transports' && (
        <Card className="liquid-glass-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Todos os Transportes no Período</CardTitle>
            <CardDescription>{data.transports.length} registros</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Hóspedes</TableHead>
                  <TableHead>KM</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transports.map(t => (
                  <TableRow key={t.id} className={t.status === 'cancelado' ? 'opacity-50' : ''}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                    <TableCell className="text-xs font-medium">{t.origem} → {t.destino}</TableCell>
                    <TableCell className="text-xs">{t.vehicleName || '—'}</TableCell>
                    <TableCell className="text-xs">{t.motoristaNome || '—'}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{t.guestNames.join(', ') || '—'}</TableCell>
                    <TableCell className="text-xs font-medium">{fmtKm(t.km)}</TableCell>
                    <TableCell><Badge variant={KM_SOURCE_BADGE[t.kmSource].variant} className="text-[10px]">{KM_SOURCE_BADGE[t.kmSource].label}</Badge></TableCell>
                    <TableCell><span className={`status-badge ${STATUS_COLORS[t.status] || ''}`}>{t.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── VEHICLES TAB ── */}
      {activeTab === 'vehicles' && (
        <Card className="liquid-glass-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Consolidação por Veículo</CardTitle>
            <CardDescription>{data.vehicleSummaries.length} veículos utilizados</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Transportes</TableHead>
                  <TableHead>KM Per. 1</TableHead>
                  <TableHead>KM Per. 2</TableHead>
                  <TableHead>KM Total</TableHead>
                  <TableHead>Dias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.vehicleSummaries.map(v => (
                  <TableRow key={v.vehicleId}>
                    <TableCell className="font-medium text-xs">{v.vehicleName}</TableCell>
                    <TableCell className="text-xs">{v.vehiclePlaca}</TableCell>
                    <TableCell className="text-xs">{v.transportCount}</TableCell>
                    <TableCell className="text-xs">{fmtKm(v.kmByPeriod['p1'] || 0)}</TableCell>
                    <TableCell className="text-xs">{fmtKm(v.kmByPeriod['p2'] || 0)}</TableCell>
                    <TableCell className="text-xs font-bold">{fmtKm(v.kmTotal)}</TableCell>
                    <TableCell className="text-xs">{v.daysUsed.size}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── GUESTS TAB ── */}
      {activeTab === 'guests' && (
        <div className="space-y-3">
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="py-3 flex items-center gap-2 text-sm text-warning">
              <Info className="w-4 h-4 shrink-0" />
              Esta seção é analítica. KM dos hóspedes NÃO são somados ao total operacional da frota.
            </CardContent>
          </Card>
          <Card className="liquid-glass-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Hóspedes Vinculados a Transportes</CardTitle>
              <CardDescription>{data.guestSummaries.length} hóspedes</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóspede</TableHead>
                    <TableHead>Hospedagem</TableHead>
                    <TableHead>Transportes</TableHead>
                    <TableHead>Deslocamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.guestSummaries.map(g => (
                    <TableRow key={g.guestId}>
                      <TableCell className="font-medium text-xs">{g.guestName}</TableCell>
                      <TableCell className="text-xs">{g.hotelNome || '—'}</TableCell>
                      <TableCell className="text-xs">{g.transports.length}</TableCell>
                      <TableCell className="text-xs max-w-[300px]">
                        {g.transports.map(t => `${fmtDate(t.date)}: ${t.origem}→${t.destino}`).join('; ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ISSUES TAB ── */}
      {activeTab === 'issues' && (
        <Card className="liquid-glass-card overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Inconsistências e Dados Pendentes
            </CardTitle>
            <CardDescription>{data.inconsistencies.length} item(ns) detectado(s)</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.inconsistencies.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-success" />
                <p>Nenhuma inconsistência detectada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Transporte</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.inconsistencies.map((inc, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{fmtDate(inc.date)}</TableCell>
                      <TableCell className="text-xs font-mono">{inc.transportId.slice(0, 8)}...</TableCell>
                      <TableCell className="text-xs">{inc.description}</TableCell>
                      <TableCell>
                        <Badge variant={inc.type === 'cancelled' ? 'outline' : 'destructive'} className="text-[10px]">
                          {inc.type}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Helper components ── */
function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

const BigStat = React.forwardRef<HTMLDivElement, { label: string; value: string; accent: string }>(
  ({ label, value, accent }, ref) => (
    <div ref={ref} className="text-center p-3 rounded-xl bg-muted/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold text-${accent}`}>{value}</p>
    </div>
  )
);
BigStat.displayName = 'BigStat';

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}`;
}
