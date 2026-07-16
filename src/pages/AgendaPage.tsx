import { useEvents } from '@/hooks/useEvents';
import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCommissions } from '@/hooks/useCommissions';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useGuests } from '@/hooks/useGuests';
import { useTransportGuests } from '@/hooks/useTransportGuests';
import { useVehicles } from '@/hooks/useVehicles';

import { Plus, CalendarOff, FileDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn, rawTime, todaySP, getDateSP, parseDateKey, mergeDateAndTimeSP, getEffectiveOneWayMin, getEffectiveTotalMin } from '@/lib/utils';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { AgendaItemCard3D, ShiftSectionHeader } from '@/components/agenda/AgendaItemCard3D';
import { AgendaItemDetailDialog } from '@/components/agenda/AgendaItemDetailDialog';
import { FENASOJA_2028_COLORS } from '@/lib/fenasoja-brand';

const emptyForm = { titulo: '', descricao: '', inicio_em: '', fim_em: '', local: '', tipo_tag: '', responsavel_user_id: '', commission_id: '', repetir_diariamente: false };

/* ── helpers ──────────────────────────────────────────── */

// getDateSP is now imported from utils

function getShift(iso: string): 'manha' | 'tarde' | 'noite' {
  const d = new Date(iso);
  const h = parseInt(d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }), 10);
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}


function isNowBetween(start: string, end: string): boolean {
  const now = new Date();
  return now >= new Date(start) && now <= new Date(end);
}

/* ── PDF generator ── */
function generateAgendaPDF(
  selectedDate: string,
  dayEvents: any[],
  grouped: Record<string, any[]>,
  members: any[],
  commissions: any[],
) {
  const brand = FENASOJA_2028_COLORS;
  const dateFormatted = (() => {
    const [y, m, d] = selectedDate.split('-');
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  })();

  const shiftLabels: Record<string, string> = { manha: '☀ MANHÃ', tarde: '🌅 TARDE', noite: '🌙 NOITE' };

  let html = `
    <html><head><meta charset="utf-8"><title>Agenda Fenasoja - ${dateFormatted}</title>
    <style>
      @page { margin: 18mm 15mm; size: A4; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.4; }
      .header { text-align: center; border-bottom: 3px solid ${brand.orange}; padding-bottom: 12px; margin-bottom: 18px; }
      .header h1 { font-size: 20pt; color: ${brand.indigo}; margin-bottom: 2px; }
      .header p { font-size: 10pt; color: #666; }
      .date-title { font-size: 13pt; font-weight: 700; text-transform: capitalize; margin-bottom: 16px; color: #333; }
      .shift-header { font-size: 11pt; font-weight: 700; color: ${brand.indigo}; border-bottom: 1.5px solid #e0e0e0; padding-bottom: 4px; margin: 16px 0 10px; text-transform: uppercase; letter-spacing: 1px; }
      .event-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; page-break-inside: avoid; background: #fafafa; }
      .event-title { font-size: 12pt; font-weight: 700; margin-bottom: 3px; }
      .event-time { font-size: 10pt; color: ${brand.blue}; font-weight: 600; margin-bottom: 4px; }
      .event-meta { font-size: 9pt; color: #555; margin-bottom: 2px; }
      .event-meta strong { color: #333; }
      .event-desc { font-size: 9pt; color: #444; margin-top: 5px; padding-top: 5px; border-top: 1px dashed #ddd; white-space: pre-wrap; }
      .badge { display: inline-block; background: #eef0ff; color: ${brand.indigo}; padding: 1px 8px; border-radius: 6px; font-size: 8pt; font-weight: 600; margin-left: 6px; }
      .badge-transport { background: #e3f2fd; color: #1565c0; }
      .footer { margin-top: 24px; text-align: center; font-size: 8pt; color: #999; border-top: 1px solid #e0e0e0; padding-top: 8px; }
      .summary { background: ${brand.softWhite}; border: 1px solid #d7daf6; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }
      .summary p { font-size: 9pt; color: #333; }
    </style></head><body>
    <div class="header">
      <h1>Agenda de Transportes</h1>
      <p>Gestão dos deslocamentos e recepção de convidados — Fenasoja 2028</p>
    </div>
    <div class="date-title">📅 ${dateFormatted}</div>
    <div class="summary">
      <p><strong>Total de compromissos:</strong> ${dayEvents.length} &nbsp;|&nbsp;
      <strong>Manhã:</strong> ${grouped.manha.length} &nbsp;|&nbsp;
      <strong>Tarde:</strong> ${grouped.tarde.length} &nbsp;|&nbsp;
      <strong>Noite:</strong> ${grouped.noite.length}</p>
    </div>`;

  for (const shift of ['manha', 'tarde', 'noite'] as const) {
    const items = grouped[shift];
    if (items.length === 0) continue;
    html += `<div class="shift-header">${shiftLabels[shift]} (${items.length})</div>`;
    for (const e of items) {
      const member = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
      const comm = member?.commission_id ? commissions.find((c: any) => c.id === member.commission_id) : null;
      const isTransport = e._source === 'transport' || e.tipo_tag === 'transporte';
      const statusLabel = e._transportStatus === 'em_andamento' ? 'Em andamento' : e._transportStatus === 'pendente' ? 'Pendente' : '';

      html += `<div class="event-card">`;
      html += `<div class="event-title">${e.titulo || 'Sem título'}`;
      if (e.tipo_tag) html += `<span class="badge ${isTransport ? 'badge-transport' : ''}">${e.tipo_tag}</span>`;
      if (isTransport && statusLabel) html += `<span class="badge badge-transport">${statusLabel}</span>`;
      html += `</div>`;
      html += `<div class="event-time">⏰ ${rawTime(e.inicio_em)} — ${rawTime(e.fim_em)}</div>`;
      if (e.local) html += `<div class="event-meta">📍 <strong>Local:</strong> ${e.local}</div>`;
      if (e._vehicle) html += `<div class="event-meta">🚙 <strong>Veículo:</strong> ${e._vehicle.placa}${e._vehicle.modelo ? ` · ${e._vehicle.modelo}` : ''}</div>`;
      if (member) html += `<div class="event-meta">👤 <strong>Responsável:</strong> ${member.nome_exibicao}${member.cargo ? ` (${member.cargo})` : ''}</div>`;
      if (comm) html += `<div class="event-meta">👥 <strong>Comissão:</strong> ${comm.nome}</div>`;
      if (e.descricao) html += `<div class="event-desc">${e.descricao}</div>`;
      html += `</div>`;
    }
  }

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  html += `<div class="footer">Documento gerado em ${now} — Sistema de Logística Fenasoja</div>`;
  html += `</body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

/* ── component ────────────────────────────────────────── */

export default function AgendaPage() {
  const { events, isLoading: eventsLoading, create, update, remove } = useEvents();
  const { transports, isLoading: transportsLoading } = useTransports();
  const { members } = useOrgMembers();
  const { commissions } = useCommissions();
  const { myRole } = useCurrentOrg();
  const { guests } = useGuests();
  const { getGuestsForTransport } = useTransportGuests();
  const { vehicles } = useVehicles();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [detailItem, setDetailItem] = useState<any | null>(null);

  const isLoading = eventsLoading || transportsLoading;
  const today = todaySP();

  /* ── Merge events + active transports ── */
  const allItems = useMemo(() => {
    // Regular events (exclude auto-created transport events to avoid duplicates)
    const regularEvents = events
      .filter((e: any) => e.tipo_tag !== 'transporte')
      .map((e: any) => ({ ...e, _source: 'event' as const }));

    // Same logic as TransportCard's formatReturnTime / saída display
    const ESTIMATED_DUR: Record<string, number> = {
      Aeroporto: 120, Hotel: 45, Parque: 30, Centro: 40, 'Escolta Policial': 90, Outros: 60,
    };
    const ARRIVAL_GROUND_BUFFER_MIN = 30;
    const buildSPDT = (baseIso: string, hhmm: string): Date | null => {
      try {
        const d = new Date(`${String(baseIso).slice(0, 10)}T${hhmm}:00-03:00`);
        return isNaN(d.getTime()) ? null : d;
      } catch { return null; }
    };

    // All transports (exclude only cancelado; prefix cancelled label if needed later)
    const allTransports = transports
      .filter((t: any) => t.status !== 'cancelado')
      .map((t: any) => {
        const guestIds = getGuestsForTransport(t.id);
        const guestNames = guestIds.map((gid: string) => guests.find((g: any) => g.id === gid)?.nome).filter(Boolean);
        const statusPrefix = t.status === 'concluido' ? '✅ ' : '';

        // Saída displayed = horario_saida text overlaid on inicio_em date
        const saidaIso = t.horario_saida
          ? mergeDateAndTimeSP(t.inicio_em, t.horario_saida)
          : t.inicio_em;

        // Retorno: prefer fim_em; for airport anchor on flight event; otherwise saida + preset
        let fimIso: string;
        if (t.fim_em) {
          fimIso = t.fim_em;
        } else if (t.titulo === 'Aeroporto' && (t.voo_chegada || t.voo_checkin)) {
          const oneWay = getEffectiveOneWayMin(t.duracao_estimada_min, t.titulo, t.voo_cidade, t.destino, t.distancia_estimada_km);
          const totalDur = getEffectiveTotalMin(t.duracao_estimada_min, t.titulo, t.voo_cidade, t.destino, t.distancia_estimada_km);
          if (t.voo_chegada) {
            const landing = buildSPDT(t.inicio_em, t.voo_chegada);
            fimIso = landing
              ? new Date(landing.getTime() + (ARRIVAL_GROUND_BUFFER_MIN + oneWay) * 60000).toISOString()
              : new Date(new Date(saidaIso).getTime() + totalDur * 60000).toISOString();
          } else {
            const checkin = buildSPDT(t.inicio_em, t.voo_checkin);
            fimIso = checkin
              ? new Date(checkin.getTime() + oneWay * 60000).toISOString()
              : new Date(new Date(saidaIso).getTime() + totalDur * 60000).toISOString();
          }
        } else {
          fimIso = new Date(
            new Date(saidaIso).getTime() +
              (getEffectiveTotalMin(t.duracao_estimada_min, t.titulo, t.voo_cidade, t.destino, t.distancia_estimada_km) * 60000)
          ).toISOString();
        }

        const vehicle = t.vehicle_id ? vehicles.find((v: any) => v.id === t.vehicle_id) : null;

        return {
          id: t.id,
          titulo: `${statusPrefix}Transporte: ${t.titulo || ''} ${t.origem} → ${t.destino}`.trim(),
          descricao: guestNames.length ? `Hóspedes: ${guestNames.join(', ')}` : null,
          inicio_em: saidaIso,
          fim_em: fimIso,
          local: `${t.origem} → ${t.destino}`,
          tipo_tag: 'transporte',
          responsavel_user_id: t.motorista_user_id,
          _source: 'transport' as const,
          _transportStatus: t.status,
          _transportTitulo: t.titulo,
          _horarioSaidaText: t.horario_saida || null,
          _vehicleId: t.vehicle_id || null,
          _vehicle: vehicle ? { placa: vehicle.placa, modelo: vehicle.modelo } : null,
          _voo: {
            checkin: t.voo_checkin || null,
            chegada: t.voo_chegada || null,
            cidade: t.voo_cidade || null,
            numero: t.voo_numero || null,
          },
        };
      });

    return [...regularEvents, ...allTransports];
  }, [events, transports, guests, getGuestsForTransport, vehicles]);

  /* ── dates ── */
  const dates: string[] = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach((e: any) => {
      const d = e.inicio_em ? getDateSP(e.inicio_em) : undefined;
      if (d) set.add(d);
    });
    const arr = [...set].sort();
    if (arr.length === 0) arr.push(today);
    return arr;
  }, [allItems, today]);

  const [selectedDate, setSelectedDate] = useState<string>(dates.includes(today) ? today : dates[0]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep selectedDate valid when dates change
  useEffect(() => {
    if (!dates.includes(selectedDate)) {
      setSelectedDate(dates.includes(today) ? today : dates[0]);
    }
  }, [dates, selectedDate, today]);

  // Scroll active chip into view
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector('[data-active="true"]') as HTMLElement | null;
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  /* ── day events grouped by shift ── */
  const dayEvents = useMemo(() => {
    return allItems
      .filter((e: any) => e.inicio_em && getDateSP(e.inicio_em) === selectedDate)
      .sort((a: any, b: any) => a.inicio_em.localeCompare(b.inicio_em));
  }, [allItems, selectedDate]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { manha: [], tarde: [], noite: [] };
    dayEvents.forEach((e: any) => {
      g[getShift(e.inicio_em)].push(e);
    });
    return g;
  }, [dayEvents]);

  /* ── form handlers ── */
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (e: any) => {
    const responsavelMember = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
    setEditingId(e.id);
    setForm({
      titulo: e.titulo || '',
      descricao: e.descricao || '',
      inicio_em: e.inicio_em ? e.inicio_em.slice(0, 16) : '',
      fim_em: e.fim_em ? e.fim_em.slice(0, 16) : '',
      local: e.local || '',
      tipo_tag: e.tipo_tag || '',
      responsavel_user_id: e.responsavel_user_id || 'none',
      commission_id: responsavelMember?.commission_id || 'none',
      repetir_diariamente: false,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.titulo || !form.inicio_em || !form.fim_em) return;
    const payload = {
      titulo: form.titulo,
      descricao: form.descricao || null,
      inicio_em: form.inicio_em,
      fim_em: form.fim_em,
      local: form.local || null,
      tipo_tag: form.tipo_tag || null,
      responsavel_user_id: form.responsavel_user_id && form.responsavel_user_id !== 'none' ? form.responsavel_user_id : null,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, ...payload });
        toast.success('Evento atualizado');
      } else if (form.repetir_diariamente) {
        const startDate = new Date(form.inicio_em);
        const endDate = new Date(form.fim_em);
        const diffMs = endDate.getTime() - startDate.getTime();
        for (let i = 0; i < 7; i++) {
          const newStart = new Date(startDate.getTime() + i * 86400000);
          const newEnd = new Date(newStart.getTime() + diffMs);
          await create.mutateAsync({ ...payload, inicio_em: newStart.toISOString().slice(0, 16), fim_em: newEnd.toISOString().slice(0, 16) });
        }
        toast.success('7 eventos criados (diário)');
      } else {
        await create.mutateAsync(payload);
        toast.success('Evento criado');
      }
      setForm(emptyForm); setEditingId(null); setOpen(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const isSubmitting = create.isPending || update.isPending;

  /* ── render ── */
  return (
    <div className="agenda-page-shell space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/75 bg-card/78 p-4 shadow-[var(--elevation-1)] backdrop-blur-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Agenda de Transportes</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão dos deslocamentos e recepção de convidados</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generateAgendaPDF(selectedDate, dayEvents, grouped, members, commissions)} className="h-11 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform" disabled={dayEvents.length === 0}>
            <FileDown className="w-4 h-4" /> PDF
          </Button>
          <Button size="sm" onClick={openCreate} className="h-11 sm:h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <Plus className="w-4 h-4" /> Novo Evento
          </Button>
        </div>
      </div>

      {/* ── Day chips ── */}
      <div ref={scrollRef} className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 scrollbar-hide">
        {dates.map((d) => {
          const active = d === selectedDate;
          const isToday = d === today;
          return (
            <button
              key={d}
              data-active={active}
              onClick={() => setSelectedDate(d)}
              className={cn(
                'agenda-day-chip relative flex min-w-[72px] shrink-0 snap-center flex-col items-center overflow-hidden rounded-xl border px-4 py-2.5 transition-[background-color,border-color,color,box-shadow,transform] duration-200',
                active
                  ? 'border-primary bg-primary text-primary-foreground shadow-[var(--elevation-2)]'
                  : 'border-border bg-card text-foreground shadow-[var(--elevation-1)] hover:border-primary/30 hover:bg-secondary/50'
              )}
            >
              <span className="relative text-[10px] uppercase font-semibold tracking-wide opacity-85">{parseDateKey(d).toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
              <span className="relative text-lg font-bold leading-tight tabular-nums">
                {parseDateKey(d).toLocaleDateString('pt-BR', { day: '2-digit' })}
              </span>
              <span className="relative text-[10px] uppercase opacity-75">{parseDateKey(d).toLocaleDateString('pt-BR', { month: 'short' })}</span>
              {isToday && (
                <span className="relative mt-0.5 h-1.5 w-1.5 rounded-full bg-gold" aria-label="Hoje" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-14 w-14 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-1/2 bg-white/10" />
                <Skeleton className="h-3 w-1/3 bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && dayEvents.length === 0 && (
        <div className="glass-panel flex flex-col items-center justify-center rounded-2xl py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-secondary">
            <CalendarOff className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum evento neste dia</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">Cadastre a programação oficial para que a equipe acompanhe a agenda da feira.</p>
          <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform">
            <Plus className="w-4 h-4" /> Criar evento
          </Button>
        </div>
      )}

      {/* ── Events grouped by shift ── */}
      {!isLoading && dayEvents.length > 0 && (
        <div className="space-y-6">
          {(['manha', 'tarde', 'noite'] as const).map((shift) => {
            const items = grouped[shift];
            if (items.length === 0) return null;
            return (
              <section key={shift}>
                <ShiftSectionHeader shift={shift} count={items.length} />
                <div className="space-y-3">
                  {items.map((e: any, idx: number) => {
                    const isCurrent = isNowBetween(e.inicio_em, e.fim_em);
                    const member = e.responsavel_user_id ? members.find((m: any) => m.user_id === e.responsavel_user_id) : null;
                    const comm = member?.commission_id ? commissions.find((c: any) => c.id === member.commission_id) : null;
                    return (
                      <AgendaItemCard3D
                        key={e.id}
                        item={e}
                        shift={shift}
                        index={idx}
                        isCurrent={isCurrent}
                        member={member}
                        commission={comm}
                        onOpen={setDetailItem}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Detail dialog (event OR transport) ── */}
      <AgendaItemDetailDialog
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(v) => { if (!v) setDetailItem(null); }}
        members={members}
        commissions={commissions}
        guests={guests}
        getGuestsForTransport={getGuestsForTransport}
        myRole={myRole}
        onEdit={openEdit}
        onDelete={(id) => remove.mutate(id)}
      />

      {/* ── Modal ── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Evento' : 'Criar Evento'}</DialogTitle>
            <DialogDescription>{editingId ? 'Atualize as informações do evento' : 'Adicione um novo evento à programação'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Título do evento" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <Textarea placeholder="Observações (campo livre)" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="min-h-[80px]" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                <DateTimePicker value={form.inicio_em} onChange={(v) => setForm({ ...form, inicio_em: v })} placeholder="Início" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                <DateTimePicker value={form.fim_em} onChange={(v) => setForm({ ...form, fim_em: v })} placeholder="Fim" />
              </div>
            </div>
            <Input placeholder="Local" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
            <Select value={form.commission_id} onValueChange={(v) => setForm({ ...form, commission_id: v, responsavel_user_id: '' })}>
              <SelectTrigger><SelectValue placeholder="Comissão (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas as comissões</SelectItem>
                {commissions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.responsavel_user_id} onValueChange={(v) => setForm({ ...form, responsavel_user_id: v })}>
              <SelectTrigger><SelectValue placeholder="Responsável (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members
                  .filter((m: any) => !form.commission_id || form.commission_id === 'none' || m.commission_id === form.commission_id)
                  .map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Categoria / Tag" value={form.tipo_tag} onChange={(e) => setForm({ ...form, tipo_tag: e.target.value })} />
            {!editingId && (
              <div className="flex items-center gap-2">
                <Switch id="repetir" checked={form.repetir_diariamente} onCheckedChange={(v) => setForm({ ...form, repetir_diariamente: v })} />
                <Label htmlFor="repetir" className="text-sm cursor-pointer">Repetir diariamente (7 dias)</Label>
              </div>
            )}
            <Button onClick={handleSave} className="w-full h-11 rounded-xl font-semibold active:scale-[0.97] transition-all" disabled={isSubmitting}>
              {editingId ? 'Salvar Alterações' : 'Criar Evento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
