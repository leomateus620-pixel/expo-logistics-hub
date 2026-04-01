import { getRoundTripKm } from './utils';

/* ── Types ── */
export interface Period {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (inclusive)
}

export type KmSource = 'saved' | 'known_route' | 'insufficient';

export interface NormalizedTransport {
  id: string;
  date: string; // YYYY-MM-DD
  periodId: string | null;
  inicio_em: string;
  origem: string;
  destino: string;
  vehicleId: string | null;
  vehicleName: string | null;
  vehiclePlaca: string | null;
  motoristaUserId: string | null;
  motoristaNome: string | null;
  guestIds: string[];
  guestNames: string[];
  status: string;
  km: number | null;
  kmSource: KmSource;
  titulo: string | null;
  vooCidade: string | null;
  observacoes: string | null;
  inconsistencies: string[];
}

export interface DaySummary {
  date: string;
  transports: NormalizedTransport[];
  kmConfirmed: number;
  kmPending: number;
  transportCount: number;
  vehicleIds: Set<string>;
  guestIds: Set<string>;
  inconsistentCount: number;
}

export interface PeriodSummary {
  period: Period;
  totalKmConfirmed: number;
  totalKmPending: number;
  transportCount: number;
  transportConfirmed: number;
  transportPending: number;
  vehicleCount: number;
  guestCount: number;
  inconsistentCount: number;
  days: DaySummary[];
}

export interface VehicleSummary {
  vehicleId: string;
  vehicleName: string;
  vehiclePlaca: string;
  transportCount: number;
  kmByPeriod: Record<string, number>;
  kmTotal: number;
  daysUsed: Set<string>;
  transportIds: string[];
  inconsistencies: string[];
}

export interface GuestSummary {
  guestId: string;
  guestName: string;
  hotelNome: string | null;
  transports: Array<{
    id: string;
    date: string;
    origem: string;
    destino: string;
    vehicleName: string | null;
    km: number | null;
  }>;
}

export interface Inconsistency {
  transportId: string;
  date: string;
  description: string;
  type: 'no_vehicle' | 'no_km' | 'no_route' | 'broken_guest_link' | 'cancelled';
}

export interface ConsolidationResult {
  transports: NormalizedTransport[];
  periods: PeriodSummary[];
  totalKmConfirmed: number;
  totalKmPending: number;
  totalTransports: number;
  totalVehicles: number;
  totalGuests: number;
  vehicleSummaries: VehicleSummary[];
  guestSummaries: GuestSummary[];
  inconsistencies: Inconsistency[];
}

/* ── Periods ── */
export const FAIR_PERIODS: Period[] = [
  { id: 'p1', label: 'Período 1', start: '2026-04-29', end: '2026-05-02' },
  { id: 'p2', label: 'Período 2', start: '2026-05-02', end: '2026-05-10' },
];

function getDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function findPeriod(date: string, periods: Period[]): string | null {
  for (const p of periods) {
    if (date >= p.start && date <= p.end) return p.id;
  }
  return null;
}

function resolveKm(t: any): { km: number | null; source: KmSource } {
  // Source 1: explicit km saved
  if (t.distancia_estimada_km != null && t.distancia_estimada_km > 0) {
    return { km: t.distancia_estimada_km, source: 'saved' };
  }
  // Source 2: known route
  const known = getRoundTripKm(t.titulo, t.voo_cidade);
  if (known != null) {
    return { km: known, source: 'known_route' };
  }
  // Source 3: insufficient
  return { km: null, source: 'insufficient' };
}

/* ── Main consolidation function ── */
export function consolidateTransports(
  transports: any[],
  transportGuests: any[],
  guests: any[],
  vehicles: any[],
  members: any[],
  periods: Period[] = FAIR_PERIODS
): ConsolidationResult {
  const guestMap = new Map<string, any>(guests.map((g: any) => [g.id, g]));
  const vehicleMap = new Map<string, any>(vehicles.map((v: any) => [v.id, v]));
  const memberMap = new Map<string, any>(members.map((m: any) => [m.user_id, m]));

  // Build transport→guests map
  const tgMap = new Map<string, string[]>();
  for (const tg of transportGuests) {
    const list = tgMap.get(tg.transport_id) || [];
    list.push(tg.guest_id);
    tgMap.set(tg.transport_id, list);
  }

  // Filter transports within any period
  const allDates = new Set<string>();
  for (const p of periods) {
    let d = p.start;
    while (d <= p.end) {
      allDates.add(d);
      const next = new Date(d + 'T12:00:00');
      next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
    }
  }

  const normalized: NormalizedTransport[] = [];
  const inconsistencies: Inconsistency[] = [];
  const seenIds = new Set<string>();

  for (const t of transports) {
    const date = getDateStr(t.inicio_em);
    const periodId = findPeriod(date, periods);
    if (!periodId) continue; // outside fair periods

    // Dedup
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);

    const vehicle = t.vehicle_id ? vehicleMap.get(t.vehicle_id) : null;
    const motorista = t.motorista_user_id ? memberMap.get(t.motorista_user_id) : null;
    const guestIds = tgMap.get(t.id) || (t.guest_id ? [t.guest_id] : []);
    const uniqueGuestIds = [...new Set(guestIds)];
    const guestNames = uniqueGuestIds.map(gid => guestMap.get(gid)?.nome || 'Desconhecido');

    const { km, source } = resolveKm(t);
    const itemInconsistencies: string[] = [];

    if (!t.vehicle_id) {
      itemInconsistencies.push('Sem veículo associado');
      inconsistencies.push({ transportId: t.id, date, description: 'Sem veículo associado', type: 'no_vehicle' });
    }
    if (source === 'insufficient') {
      itemInconsistencies.push('KM não consolidado — base insuficiente');
      inconsistencies.push({ transportId: t.id, date, description: 'KM não consolidado — base insuficiente', type: 'no_km' });
    }
    if (!t.origem || !t.destino) {
      itemInconsistencies.push('Origem ou destino não definido');
      inconsistencies.push({ transportId: t.id, date, description: 'Origem ou destino não definido', type: 'no_route' });
    }
    if (t.status === 'cancelado') {
      inconsistencies.push({ transportId: t.id, date, description: 'Transporte cancelado — excluído do total', type: 'cancelled' });
    }

    // Check broken guest links
    for (const gid of uniqueGuestIds) {
      if (!guestMap.has(gid)) {
        itemInconsistencies.push(`Hóspede ${gid} não encontrado`);
        inconsistencies.push({ transportId: t.id, date, description: `Vínculo de hóspede quebrado: ${gid}`, type: 'broken_guest_link' });
      }
    }

    normalized.push({
      id: t.id,
      date,
      periodId,
      inicio_em: t.inicio_em,
      origem: t.origem || '',
      destino: t.destino || '',
      vehicleId: t.vehicle_id,
      vehicleName: vehicle ? `${vehicle.marca || ''} ${vehicle.modelo || ''}`.trim() : null,
      vehiclePlaca: vehicle?.placa || null,
      motoristaUserId: t.motorista_user_id,
      motoristaNome: motorista?.nome_exibicao || null,
      guestIds: uniqueGuestIds,
      guestNames,
      status: t.status,
      km,
      kmSource: source,
      titulo: t.titulo,
      vooCidade: t.voo_cidade,
      observacoes: t.observacoes,
      inconsistencies: itemInconsistencies,
    });
  }

  // Only non-cancelled for official totals
  const official = normalized.filter(t => t.status !== 'cancelado');

  // Period summaries
  const periodSummaries: PeriodSummary[] = periods.map(p => {
    const pt = official.filter(t => t.periodId === p.id);
    const confirmed = pt.filter(t => t.km != null && (t.status === 'concluido' || t.status === 'em_andamento'));
    const pending = pt.filter(t => t.status === 'pendente');

    // Group by day
    const dayMap = new Map<string, NormalizedTransport[]>();
    for (const t of pt) {
      const list = dayMap.get(t.date) || [];
      list.push(t);
      dayMap.set(t.date, list);
    }

    const days: DaySummary[] = [];
    let d = p.start;
    while (d <= p.end) {
      const dayTransports = dayMap.get(d) || [];
      const vids = new Set<string>();
      const gids = new Set<string>();
      let kmC = 0, kmP = 0, inc = 0;
      for (const t of dayTransports) {
        if (t.vehicleId) vids.add(t.vehicleId);
        t.guestIds.forEach(g => gids.add(g));
        if (t.km != null) {
          if (t.status === 'pendente') kmP += t.km;
          else kmC += t.km;
        }
        if (t.inconsistencies.length > 0) inc++;
      }
      days.push({
        date: d,
        transports: dayTransports,
        kmConfirmed: kmC,
        kmPending: kmP,
        transportCount: dayTransports.length,
        vehicleIds: vids,
        guestIds: gids,
        inconsistentCount: inc,
      });
      const next = new Date(d + 'T12:00:00');
      next.setDate(next.getDate() + 1);
      d = next.toISOString().slice(0, 10);
    }

    const allVehicles = new Set<string>();
    const allGuests = new Set<string>();
    let totalC = 0, totalP = 0;
    for (const t of pt) {
      if (t.vehicleId) allVehicles.add(t.vehicleId);
      t.guestIds.forEach(g => allGuests.add(g));
      if (t.km != null) {
        if (t.status === 'pendente') totalP += t.km;
        else totalC += t.km;
      }
    }

    return {
      period: p,
      totalKmConfirmed: totalC,
      totalKmPending: totalP,
      transportCount: pt.length,
      transportConfirmed: confirmed.length,
      transportPending: pending.length,
      vehicleCount: allVehicles.size,
      guestCount: allGuests.size,
      inconsistentCount: pt.filter(t => t.inconsistencies.length > 0).length,
      days,
    };
  });

  // Vehicle summaries
  const vMap = new Map<string, VehicleSummary>();
  for (const t of official) {
    if (!t.vehicleId) continue;
    let vs = vMap.get(t.vehicleId);
    if (!vs) {
      vs = {
        vehicleId: t.vehicleId,
        vehicleName: t.vehicleName || 'Sem nome',
        vehiclePlaca: t.vehiclePlaca || '',
        transportCount: 0,
        kmByPeriod: {},
        kmTotal: 0,
        daysUsed: new Set(),
        transportIds: [],
        inconsistencies: [],
      };
      vMap.set(t.vehicleId, vs);
    }
    vs.transportCount++;
    vs.transportIds.push(t.id);
    vs.daysUsed.add(t.date);
    if (t.km != null) {
      vs.kmTotal += t.km;
      if (t.periodId) {
        vs.kmByPeriod[t.periodId] = (vs.kmByPeriod[t.periodId] || 0) + t.km;
      }
    }
  }
  const vehicleSummaries = Array.from(vMap.values()).sort((a, b) => b.kmTotal - a.kmTotal);

  // Guest summaries
  const gMap = new Map<string, GuestSummary>();
  for (const t of official) {
    for (const gid of t.guestIds) {
      let gs = gMap.get(gid);
      if (!gs) {
        const g = guestMap.get(gid);
        gs = {
          guestId: gid,
          guestName: g?.nome || 'Desconhecido',
          hotelNome: g?.hotel_nome || null,
          transports: [],
        };
        gMap.set(gid, gs);
      }
      gs.transports.push({
        id: t.id,
        date: t.date,
        origem: t.origem,
        destino: t.destino,
        vehicleName: t.vehicleName,
        km: t.km,
      });
    }
  }
  const guestSummaries = Array.from(gMap.values()).sort((a, b) => a.guestName.localeCompare(b.guestName));

  // Totals
  const allVehicleIds = new Set<string>();
  const allGuestIds = new Set<string>();
  let totalC = 0, totalP = 0;
  for (const t of official) {
    if (t.vehicleId) allVehicleIds.add(t.vehicleId);
    t.guestIds.forEach(g => allGuestIds.add(g));
    if (t.km != null) {
      if (t.status === 'pendente') totalP += t.km;
      else totalC += t.km;
    }
  }

  return {
    transports: normalized,
    periods: periodSummaries,
    totalKmConfirmed: totalC,
    totalKmPending: totalP,
    totalTransports: official.length,
    totalVehicles: allVehicleIds.size,
    totalGuests: allGuestIds.size,
    vehicleSummaries,
    guestSummaries,
    inconsistencies,
  };
}
