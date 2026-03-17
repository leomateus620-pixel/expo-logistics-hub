import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useVehicles } from '@/hooks/useVehicles';
import { useGuests } from '@/hooks/useGuests';

import { useCommissions } from '@/hooks/useCommissions';
import { useLocationTracking, useTransportLocation } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';
import { useTransportGuests } from '@/hooks/useTransportGuests';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Check, Clock, X, Pencil, Search, XCircle, Trash2, FileText, Eye, ArrowRight, Plane, Navigation, MapPinOff, Route, Timer, Ruler, Play, Square, History, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, rawTime, rawDateShort, nowSP, nowSPLocal, ensureSPOffset } from '@/lib/utils';
import { useState, lazy, Suspense, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent as AlertContent, AlertDialogDescription as AlertDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle as AlertTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

const DriverLocationMap = lazy(() => import('@/components/DriverLocationMap'));
import TransportDynamicIsland from '@/components/TransportDynamicIsland';
import TransportCard from '@/components/transport/TransportCard';
import TransportDetailView from '@/components/transport/TransportDetailView';
import TransportForm from '@/components/transport/TransportForm';

/* ─── Status config ─── */
const statusConfig: Record<string, { label: string; icon: typeof Check; class: string; dotClass: string; bgClass: string }> = {
  pendente: { label: 'Pendente', icon: Clock, class: 'text-info', dotClass: 'bg-info', bgClass: 'bg-info/10 border-info/20' },
  em_andamento: { label: 'Em trânsito', icon: Navigation, class: 'text-accent', dotClass: 'bg-accent', bgClass: 'bg-accent/10 border-accent/20' },
  concluido: { label: 'Concluído', icon: Check, class: 'text-success', dotClass: 'bg-success', bgClass: 'bg-success/10 border-success/20' },
  cancelado: { label: 'Cancelado', icon: X, class: 'text-destructive', dotClass: 'bg-destructive', bgClass: 'bg-destructive/10 border-destructive/20' },
};

const tituloOptions = ['Parque', 'Hotel', 'Aeroporto', 'Centro', 'Escolta Policial', 'Outros'];
const cidadeAeroportoOptions = ['Chapecó', 'Santo Ângelo', 'Passo Fundo', 'Porto Alegre'];

const SANTA_ROSA_LAT = -27.8708;
const SANTA_ROSA_LNG = -54.4814;

// Known destination coordinates for mini-map
const knownDestCoords: Record<string, { lat: number; lng: number }> = {
  'Parque': { lat: -27.8708, lng: -54.4814 },
  'Hotel': { lat: -27.8711, lng: -54.4769 },
  'Aeroporto_Chapecó': { lat: -27.1342, lng: -52.6566 },
  'Aeroporto_Santo Ângelo': { lat: -28.2817, lng: -54.1691 },
  'Aeroporto_Passo Fundo': { lat: -28.2437, lng: -52.3269 },
  'Aeroporto_Porto Alegre': { lat: -29.9939, lng: -51.1711 },
  'Centro': { lat: -27.8711, lng: -54.4769 },
  'Escolta Policial': { lat: -27.8711, lng: -54.4769 },
  'Outros': { lat: -27.8711, lng: -54.4769 },
};

function getDestCoords(t: any): { lat: number; lng: number } | null {
  if (t.titulo === 'Aeroporto' && t.voo_cidade) {
    return knownDestCoords[`Aeroporto_${t.voo_cidade}`] || null;
  }
  return knownDestCoords[t.titulo] || knownDestCoords['Outros'];
}

/** Fetch travel duration in minutes from Google Maps via edge function */
async function fetchTravelMinutes(cidade: string): Promise<number | null> {
  try {
    const destination = `Aeroporto_${cidade}`;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-return`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ origin_lat: SANTA_ROSA_LAT, origin_lng: SANTA_ROSA_LNG, destination }),
      }
    );
    const data = await res.json();
    if (data.fallback || !data.duration_minutes) return null;
    return data.duration_minutes;
  } catch {
    return null;
  }
}

/** Fetch route preview (duration, distance, polyline) */
async function fetchRoutePreview(destKey: string): Promise<{ duration_minutes: number; distance_km: number; polyline?: string } | null> {
  try {
    const dest = knownDestCoords[destKey] || knownDestCoords['Outros'];
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/estimate-return`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          mode: 'ROUTE_PREVIEW',
          origin_lat: SANTA_ROSA_LAT,
          origin_lng: SANTA_ROSA_LNG,
          dest_lat: dest.lat,
          dest_lng: dest.lng,
          destination: destKey,
        }),
      }
    );
    const data = await res.json();
    if (data.fallback) return null;
    return { duration_minutes: data.duration_minutes, distance_km: data.distance_km, polyline: data.polyline };
  } catch {
    return null;
  }
}

function subtractMinutes(time: string, mins: number): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  let totalMin = h * 60 + m - mins;
  if (totalMin < 0) totalMin += 24 * 60;
  const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const DESEMBARQUE_BUFFER_MIN: Record<string, number> = {
  'Chapecó': 270, 'Santo Ângelo': 90, 'Passo Fundo': 270, 'Porto Alegre': 480,
};
const CHECKIN_BUFFER_MIN: Record<string, number> = {
  'Chapecó': 330, 'Santo Ângelo': 150, 'Passo Fundo': 330, 'Porto Alegre': 510,
};

async function calcSuggestedDeparture(cidade: string, flightTime: string, isCheckin: boolean): Promise<string | null> {
  if (!cidade || !flightTime) return null;
  const buffer = isCheckin ? (CHECKIN_BUFFER_MIN[cidade] || 330) : (DESEMBARQUE_BUFFER_MIN[cidade] || 270);
  return subtractMinutes(flightTime, buffer);
}

// Use unified ensureSPOffset from utils (DATA-01 fix)
const ensureSPTimestamptz = ensureSPOffset;

const estimatedDurationMin: Record<string, number> = {
  'Aeroporto': 120, 'Hotel': 45, 'Parque': 30, 'Centro': 40, 'Escolta Policial': 90, 'Outros': 60,
};

function estimateReturnTime(t: any): Date | null {
  if (!t.inicio_em) return null;
  if (t.fim_em) return new Date(t.fim_em);
  const start = new Date(t.inicio_em);
  const durationMin = t.duracao_estimada_min || estimatedDurationMin[t.titulo] || 60;
  return new Date(start.getTime() + durationMin * 60000);
}

function formatReturnTime(t: any): string | null {
  const ret = estimateReturnTime(t);
  if (!ret) return null;
  return ret.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function buildEscoltaObs(data: any): string | null {
  if (data.titulo !== 'Escolta Policial') return null;
  const parts: string[] = [];
  if (data.escolta_nome) parts.push(`ESCOLTADO: ${data.escolta_nome}`);
  if (data.escolta_cargo) parts.push(`CARGO: ${data.escolta_cargo}`);
  if (data.escolta_viaturas) parts.push(`VIATURAS: ${data.escolta_viaturas}`);
  if (data.escolta_ponto_encontro) parts.push(`PONTO DE ENCONTRO: ${data.escolta_ponto_encontro}`);
  if (data.escolta_contato_seguranca) parts.push(`CONTATO SEGURANÇA: ${data.escolta_contato_seguranca}`);
  if (data.escolta_obs) parts.push(`OBS: ${data.escolta_obs}`);
  return parts.length > 0 ? parts.join('\n') : null;
}

function parseEscoltaFromObs(obs: string | null) {
  const result = { escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' };
  if (!obs) return result;
  for (const line of obs.split('\n')) {
    if (line.startsWith('ESCOLTADO: ')) result.escolta_nome = line.slice(11);
    else if (line.startsWith('CARGO: ')) result.escolta_cargo = line.slice(7);
    else if (line.startsWith('VIATURAS: ')) result.escolta_viaturas = line.slice(10);
    else if (line.startsWith('PONTO DE ENCONTRO: ')) result.escolta_ponto_encontro = line.slice(19);
    else if (line.startsWith('CONTATO SEGURANÇA: ')) result.escolta_contato_seguranca = line.slice(19);
    else if (line.startsWith('OBS: ')) result.escolta_obs = line.slice(5);
  }
  return result;
}

function generateWhatsAppText(data: any, driver: any, vehicle: any, guest: any) {
  const lines = ['🚔 *ESCOLTA POLICIAL — FENASOJA*', ''];
  if (data.escolta_nome) lines.push(`👤 *Escoltado:* ${data.escolta_nome}`);
  if (data.escolta_cargo) lines.push(`🏷️ *Cargo/Função:* ${data.escolta_cargo}`);
  lines.push(`📍 *Origem:* ${data.origem || '—'}`);
  lines.push(`📍 *Destino:* ${data.destino || '—'}`);
  if (data.inicio_em) {
    const d = new Date(data.inicio_em);
    lines.push(`📅 *Data/Hora:* ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  }
  if (driver) lines.push(`🚗 *Motorista:* ${driver.nome_exibicao || ''}`);
  if (vehicle) lines.push(`🚙 *Veículo:* ${vehicle.placa} ${vehicle.modelo || ''}`);
  if (data.escolta_viaturas) lines.push(`🚓 *Nº Viaturas:* ${data.escolta_viaturas}`);
  if (data.escolta_ponto_encontro) lines.push(`📌 *Ponto de Encontro:* ${data.escolta_ponto_encontro}`);
  if (data.escolta_contato_seguranca) lines.push(`📞 *Contato Segurança:* ${data.escolta_contato_seguranca}`);
  if (guest) lines.push(`🏨 *Hóspede:* ${guest.nome}`);
  if (data.escolta_obs) lines.push(`📝 *Obs:* ${data.escolta_obs}`);
  lines.push('', '_Mensagem gerada pelo sistema Fenasoja Logística_');
  return lines.join('\n');
}

/** Decode Google polyline to array of [lat, lng] */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/* ─── Google Maps Static Mini Map URL ─── */
function getMiniMapUrl(originLat: number, originLng: number, destLat: number, destLng: number, polyline?: string): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY; // We'll use a signed static map approach
  // Use Google Maps Static API with the GOOGLE_MAPS_API_KEY via edge function proxy instead
  // For now, use a simple Leaflet-rendered approach rather than static maps API
  return '';
}

export default function TransportsPage() {
  const { transports, create, update, remove } = useTransports();
  const { members } = useOrgMembers();
  const { vehicles } = useVehicles();
  const { guests, create: createGuest } = useGuests();
  const { commissions } = useCommissions();
  const { user } = useAuth();
  const { getGuestsForTransport } = useTransportGuests();
  const [trackingTransportId, _setTrackingTransportId] = useState<string | null>(() => {
    try { return localStorage.getItem('fenasoja_tracking_transport'); } catch { return null; }
  });
  const setTrackingTransportId = useCallback((id: string | null) => {
    _setTrackingTransportId(id);
    try { id ? localStorage.setItem('fenasoja_tracking_transport', id) : localStorage.removeItem('fenasoja_tracking_transport'); } catch { /* silent */ }
  }, []);
  const locationTracker = useLocationTracking(trackingTransportId);

  const locationTrackerRef = useRef(locationTracker);
  locationTrackerRef.current = locationTracker;

  useEffect(() => {
    if (trackingTransportId && !locationTrackerRef.current.isTracking) {
      locationTrackerRef.current.startTracking();
    }
  }, [trackingTransportId]);

  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, transports]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guestDestinations, setGuestDestinations] = useState<Record<string, string>>({});
  const [showNewGuestForm, setShowNewGuestForm] = useState(false);
  const [newGuestForm, setNewGuestForm] = useState({ nome: '', telefone: '', email: '', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' });
  const [editShowNewGuestForm, setEditShowNewGuestForm] = useState(false);
  const [editNewGuestForm, setEditNewGuestForm] = useState({ nome: '', telefone: '', email: '', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' });
  const [includeReturn, setIncludeReturn] = useState(false);
  const [returnForm, setReturnForm] = useState({ inicio_em: '', voo_numero: '', voo_checkin: '', horario_saida: '' });

  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappText, setWhatsappText] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editGuests, setEditGuests] = useState<string[]>([]);
  const [editForm, setEditForm] = useState({ titulo: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', status: 'pendente', km_retirada: '', km_devolucao: '', fim_em: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });

  const [filterMotorista, setFilterMotorista] = useState('');
  const [filterData, setFilterData] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const hasFilters = (!!filterMotorista && filterMotorista !== 'all') || !!filterData || (!!filterStatus && filterStatus !== 'all') || !!filterSearch;

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTransport, setDetailTransport] = useState<any>(null);

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedCards(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const openDetail = (t: any) => { setDetailTransport(t); setDetailOpen(true); };

  const availableVehicles = vehicles.filter((v: any) => v.status === 'disponivel');

  const isVehicleBusyAt = (vehicleId: string, startTime: string, excludeTransportId?: string) => {
    return transports.some((t: any) => {
      if (t.vehicle_id !== vehicleId) return false;
      if (!['pendente', 'em_andamento'].includes(t.status)) return false;
      if (excludeTransportId && t.id === excludeTransportId) return false;
      const estReturn = estimateReturnTime(t);
      if (!estReturn) return true;
      return new Date(startTime) < estReturn;
    });
  };

  const getVehicleConflictInfo = (vehicleId: string, startTime: string, excludeTransportId?: string) => {
    const conflicting = transports.find((t: any) => {
      if (t.vehicle_id !== vehicleId) return false;
      if (!['pendente', 'em_andamento'].includes(t.status)) return false;
      if (excludeTransportId && t.id === excludeTransportId) return false;
      const estReturn = estimateReturnTime(t);
      if (!estReturn) return true;
      return new Date(startTime) < estReturn;
    });
    if (!conflicting) return null;
    const ret = formatReturnTime(conflicting);
    return ret ? `em uso até ~${ret}` : 'em uso';
  };

  const getDriverCommission = (driverUserId: string) => {
    const member = members.find((m: any) => m.user_id === driverUserId);
    if (!member?.commission_id) return null;
    const commission = commissions.find((c: any) => c.id === member.commission_id);
    return commission?.nome || null;
  };

  const openCreateDialog = () => {
    setForm({ titulo: '', origem: 'Santa Rosa', destino: '', inicio_em: nowSPLocal(), motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });
    setSelectedGuests([]);
    setGuestDestinations({});
    setShowNewGuestForm(false);
    setNewGuestForm({ nome: '', telefone: '', email: '', hotel_nome: '', checkin_em: '', checkout_em: '', observacoes: '' });
    setIncludeReturn(false);
setReturnForm({ inicio_em: '', voo_numero: '', voo_checkin: '', horario_saida: '' });
    setOpen(true);
  };

  const handleAdd = async () => {
    const origem = (form.origem || '').trim();
    const inicioEmRaw = form.inicio_em;

    // Determine destination: use first guest's hotel or form.destino
    const destinoRaw = selectedGuests.length > 0
      ? (guestDestinations[selectedGuests[0]] || form.destino || guests.find((g: any) => g.id === selectedGuests[0])?.hotel_nome || '')
      : form.destino;

    const destino = (destinoRaw || '').trim();

    const missing: string[] = [];
    if (!origem) missing.push('Origem');
    if (!inicioEmRaw) missing.push('Data/Hora saída');
    if (!destino) missing.push('Destino (ou hotel do hóspede)');

    if (missing.length) {
      toast.error(`Preencha: ${missing.join(', ')}`);
      return;
    }

    try {
      // Fetch route estimate
      let routeData: { duration_minutes?: number; distance_km?: number; polyline?: string } = {};
      const destKey = form.titulo === 'Aeroporto' && form.voo_cidade ? `Aeroporto_${form.voo_cidade}` : (form.titulo || 'Outros');
      try {
        const preview = await fetchRoutePreview(destKey);
        if (preview) routeData = preview;
      } catch { /* continue without route data */ }

      const inicio_em = ensureSPTimestamptz(inicioEmRaw);

      const result = await create.mutateAsync({
        transport: {
          titulo: form.titulo || null,
          origem,
          destino,
          inicio_em,
          motorista_user_id: form.motorista_user_id && form.motorista_user_id !== 'none' ? form.motorista_user_id : null,
          vehicle_id: form.vehicle_id && form.vehicle_id !== 'none' ? form.vehicle_id : null,
          prioridade: form.prioridade,
          km_retirada: form.km_retirada ? Number(form.km_retirada) : null,
          voo_cidade: form.titulo === 'Aeroporto' ? form.voo_cidade || null : null,
          voo_numero: form.titulo === 'Aeroporto' ? form.voo_numero || null : null,
          voo_checkin: form.titulo === 'Aeroporto' ? form.voo_checkin || null : null,
          voo_chegada: form.titulo === 'Aeroporto' ? form.voo_chegada || null : null,
          horario_saida: form.titulo === 'Aeroporto' ? form.horario_saida || null : null,
          observacoes: buildEscoltaObs(form),
          distancia_estimada_km: routeData.distance_km || null,
          duracao_estimada_min: routeData.duration_minutes || null,
          rota_polyline: routeData.polyline || null,
        },
        guestIds: selectedGuests,
      });

      if (form.titulo === 'Escolta Policial') {
        const driver = members.find((m: any) => m.user_id === form.motorista_user_id);
        const vehicle = vehicles.find((v: any) => v.id === form.vehicle_id);
        const guest = selectedGuests.length > 0 ? guests.find((g: any) => g.id === selectedGuests[0]) : null;
        const text = generateWhatsAppText(form, driver, vehicle, guest);
        setWhatsappText(text);
        setWhatsappOpen(true);
      }

      // Create return trip if enabled
      if (includeReturn && form.titulo === 'Aeroporto' && returnForm.inicio_em) {
        try {
          const returnDestKey = form.voo_cidade ? `Aeroporto_${form.voo_cidade}` : 'Aeroporto';
          let returnRouteData: { duration_minutes?: number; distance_km?: number; polyline?: string } = {};
          try {
            const preview = await fetchRoutePreview(returnDestKey);
            if (preview) returnRouteData = preview;
          } catch { /* silent */ }

          const returnResult = await create.mutateAsync({
            transport: {
              titulo: 'Aeroporto',
              origem: destino || 'Santa Rosa',
              destino: form.voo_cidade ? `Aeroporto ${form.voo_cidade}` : origem,
              inicio_em: ensureSPTimestamptz(returnForm.inicio_em),
              motorista_user_id: form.motorista_user_id && form.motorista_user_id !== 'none' ? form.motorista_user_id : null,
              vehicle_id: form.vehicle_id && form.vehicle_id !== 'none' ? form.vehicle_id : null,
              prioridade: form.prioridade,
              voo_cidade: form.voo_cidade || null,
              voo_numero: returnForm.voo_numero || null,
              voo_checkin: returnForm.voo_checkin || null,
              horario_saida: returnForm.horario_saida || null,
              distancia_estimada_km: returnRouteData.distance_km || null,
              duracao_estimada_min: returnRouteData.duration_minutes || null,
              rota_polyline: returnRouteData.polyline || null,
            },
            guestIds: selectedGuests,
          });

          // guests handled by edge function via guestIds in create
        } catch (returnErr: any) {
          console.error('Failed to create return trip:', returnErr);
          toast.warning('Ida agendada, mas houve erro ao criar a volta. Tente criar manualmente.');
        }
      }

      setForm({ titulo: '', origem: '', destino: '', inicio_em: '', motorista_user_id: '', vehicle_id: '', prioridade: 'media', km_retirada: '', voo_cidade: '', voo_numero: '', voo_checkin: '', voo_chegada: '', horario_saida: '', escolta_nome: '', escolta_cargo: '', escolta_viaturas: '', escolta_ponto_encontro: '', escolta_contato_seguranca: '', escolta_obs: '' });
      setSelectedGuests([]);
      setGuestDestinations({});
      setIncludeReturn(false);
      setReturnForm({ inicio_em: '', voo_numero: '', voo_checkin: '', horario_saida: '' });
      setOpen(false);
      toast.success(includeReturn && form.titulo === 'Aeroporto' && returnForm.inicio_em ? 'Ida e volta agendados' : 'Transporte agendado');
    } catch (err: any) { toast.error(err.message); }
  };

  const openEditDlg = (t: any) => {
    setEditId(t.id);
    const escoltaData = parseEscoltaFromObs(t.observacoes);
    const linkedGuests = getGuestsForTransport(t.id);
    setEditGuests(linkedGuests);
    setEditForm({
      titulo: t.titulo || '', origem: t.origem, destino: t.destino,
      inicio_em: t.inicio_em?.slice(0, 16) || '', motorista_user_id: t.motorista_user_id || '',
      vehicle_id: t.vehicle_id || '', prioridade: t.prioridade || 'media',
      status: t.status,
      km_retirada: t.km_retirada != null ? String(t.km_retirada) : '',
      km_devolucao: t.km_devolucao != null ? String(t.km_devolucao) : '',
      fim_em: t.fim_em?.slice(0, 16) || '',
      voo_cidade: t.voo_cidade || '', voo_numero: t.voo_numero || '',
      voo_checkin: t.voo_checkin || '', voo_chegada: t.voo_chegada || '',
      horario_saida: t.horario_saida || '',
      ...escoltaData,
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    try {
      const currentTransport = transports.find((t: any) => t.id === editId);
      const statusChanged = currentTransport && currentTransport.status !== editForm.status;

      const updates: any = {
        titulo: editForm.titulo || null,
        origem: editForm.origem,
        destino: editForm.destino,
        inicio_em: editForm.inicio_em,
        motorista_user_id: editForm.motorista_user_id && editForm.motorista_user_id !== 'none' ? editForm.motorista_user_id : null,
        vehicle_id: editForm.vehicle_id && editForm.vehicle_id !== 'none' ? editForm.vehicle_id : null,
        prioridade: editForm.prioridade,
        status: editForm.status,
        km_retirada: editForm.km_retirada ? Number(editForm.km_retirada) : null,
        km_devolucao: editForm.status === 'concluido' && editForm.km_devolucao ? Number(editForm.km_devolucao) : null,
        fim_em: editForm.status === 'concluido' && editForm.fim_em ? editForm.fim_em : null,
        voo_cidade: editForm.titulo === 'Aeroporto' ? editForm.voo_cidade || null : null,
        voo_numero: editForm.titulo === 'Aeroporto' ? editForm.voo_numero || null : null,
        voo_checkin: editForm.titulo === 'Aeroporto' ? editForm.voo_checkin || null : null,
        voo_chegada: editForm.titulo === 'Aeroporto' ? editForm.voo_chegada || null : null,
        horario_saida: editForm.titulo === 'Aeroporto' ? editForm.horario_saida || null : null,
        observacoes: buildEscoltaObs(editForm),
      };

      // Save fim_real_em when completing
      if (statusChanged && editForm.status === 'concluido') {
        updates.fim_real_em = nowSP();
      }

      // Build vehicleUsage for edge function
      let vehicleUsage = null;
      if (statusChanged && editForm.status === 'concluido' && editForm.km_retirada && editForm.km_devolucao && editForm.vehicle_id && editForm.vehicle_id !== 'none') {
        const kmSaida = Number(editForm.km_retirada);
        const kmChegada = Number(editForm.km_devolucao);
        vehicleUsage = {
          vehicle_id: editForm.vehicle_id,
          responsavel_user_id: editForm.motorista_user_id && editForm.motorista_user_id !== 'none' ? editForm.motorista_user_id : null,
          km_saida: kmSaida,
          km_chegada: kmChegada,
          km_rodados: kmChegada - kmSaida,
          devolucao_em: editForm.fim_em || nowSP(),
        };
      }

      await update.mutateAsync({
        id: editId,
        updates,
        expectedUpdatedAt: currentTransport?.updated_at,
        guestIds: editGuests,
        vehicleUsage,
      });

      setEditOpen(false);
      toast.success('Transporte atualizado');
    } catch (err: any) { toast.error(err.message); }
  };

  const cycleStatus = async (t: any) => {
    const order = ['pendente', 'em_andamento', 'concluido'];
    const idx = order.indexOf(t.status);
    if (idx < order.length - 1) {
      const newStatus = order[idx + 1];
      if (newStatus === 'concluido') {
        if (trackingTransportId === t.id) {
          await locationTracker.stopTracking();
          setTrackingTransportId(null);
        }
        setEditId(t.id);
        const escoltaData = parseEscoltaFromObs(t.observacoes);
        const linkedGuests2 = getGuestsForTransport(t.id);
        setEditGuests(linkedGuests2);
        setEditForm({
          titulo: t.titulo || '', origem: t.origem, destino: t.destino,
          inicio_em: t.inicio_em?.slice(0, 16) || '', motorista_user_id: t.motorista_user_id || '',
          vehicle_id: t.vehicle_id || '', prioridade: t.prioridade || 'media',
          status: 'concluido',
          km_retirada: t.km_retirada != null ? String(t.km_retirada) : '',
          km_devolucao: '',
          fim_em: nowSPLocal(),
          voo_cidade: t.voo_cidade || '', voo_numero: t.voo_numero || '',
          voo_checkin: t.voo_checkin || '', voo_chegada: t.voo_chegada || '',
          horario_saida: t.horario_saida || '',
          ...escoltaData,
        });
        setEditOpen(true);
        return;
      }
      // Starting trip — save inicio_real_em
      await update.mutateAsync({ id: t.id, updates: { status: newStatus, inicio_real_em: nowSP() } });
      if (newStatus === 'em_andamento') {
        setTrackingTransportId(t.id);
        toast.success('Viagem iniciada — localização ativada');
      }
    }
  };

  const sorted = [...transports].sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');

  const filtered = sorted.filter((t: any) => {
    if (filterMotorista && filterMotorista !== 'all' && t.motorista_user_id !== filterMotorista) return false;
    if (filterData && t.inicio_em && !t.inicio_em.startsWith(filterData)) return false;
    if (filterStatus && filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
      const linkedGIds = getGuestsForTransport(t.id);
      const guestNames = linkedGIds.map((gid: string) => guests.find((g: any) => g.id === gid)?.nome).filter(Boolean);
      
      const haystack = [t.origem, t.destino, t.titulo, t.voo_numero, t.voo_cidade, driver?.nome_exibicao, ...guestNames].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!showHistory && !hasFilters) {
      if (t.status === 'concluido' && t.updated_at && t.updated_at < fourHoursAgo) return false;
    }
    return true;
  });

  const activeCount = transports.filter((t: any) => t.status === 'em_andamento').length;
  const pendingCount = transports.filter((t: any) => t.status === 'pendente').length;

  const generatePDF = (t: any) => {
    const driver = members.find((m: any) => m.user_id === t.motorista_user_id);
    const vehicle = vehicles.find((v: any) => v.id === t.vehicle_id);
    const linkedGIds = getGuestsForTransport(t.id);
    const pdfGuests = linkedGIds.map((gid: string) => guests.find((g: any) => g.id === gid)).filter(Boolean);
    const guest = pdfGuests[0] || null;
    const sc = statusConfig[t.status] || statusConfig.pendente;
    const driverCommission = t.motorista_user_id ? getDriverCommission(t.motorista_user_id) : null;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Popup bloqueado pelo navegador'); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Transporte ${t.titulo || ''}</title><style>
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; color: #1a1a1a; }
      h1 { font-size: 18px; border-bottom: 2px solid #2d6a4f; padding-bottom: 8px; margin-bottom: 16px; color: #2d6a4f; }
      .row { display: flex; gap: 8px; margin-bottom: 8px; }
      .label { font-weight: 600; color: #555; font-size: 13px; min-width: 140px; }
      .value { font-size: 14px; }
      .flight { background: #f0f7f4; padding: 12px; border-radius: 8px; margin-top: 16px; }
      .flight strong { color: #2d6a4f; }
      .footer { margin-top: 24px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
    </style></head><body>
      <h1>🚐 Transporte — ${t.titulo || 'Sem título'}</h1>
      <div class="row"><span class="label">Status:</span><span class="value">${sc.label}</span></div>
      <div class="row"><span class="label">Origem:</span><span class="value">${t.origem}</span></div>
      <div class="row"><span class="label">Destino:</span><span class="value">${t.destino}</span></div>
      <div class="row"><span class="label">Saída:</span><span class="value">${t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</span></div>
      ${t.fim_em ? `<div class="row"><span class="label">Devolução:</span><span class="value">${new Date(t.fim_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>` : ''}
      <div class="row"><span class="label">Motorista:</span><span class="value">${driver?.nome_exibicao || '—'}</span></div>
      ${driverCommission ? `<div class="row"><span class="label">Comissão:</span><span class="value">${driverCommission}</span></div>` : ''}
      <div class="row"><span class="label">Veículo:</span><span class="value">${vehicle ? `${vehicle.placa} ${vehicle.modelo || ''}` : '—'}</span></div>
      <div class="row"><span class="label">Hóspede${pdfGuests.length > 1 ? 's' : ''}:</span><span class="value">${pdfGuests.length > 0 ? pdfGuests.map((g: any) => g.nome).join(', ') : '—'}</span></div>
      ${pdfGuests.some((g: any) => g.hotel_nome) ? `<div class="row"><span class="label">Hotel:</span><span class="value">${[...new Set(pdfGuests.map((g: any) => g.hotel_nome).filter(Boolean))].join(', ')}</span></div>` : ''}
      ${t.distancia_estimada_km ? `<div class="row"><span class="label">Distância:</span><span class="value">${t.distancia_estimada_km} km</span></div>` : ''}
      ${t.duracao_estimada_min ? `<div class="row"><span class="label">Tempo Estimado:</span><span class="value">${t.duracao_estimada_min} min</span></div>` : ''}
      ${t.km_retirada != null ? `<div class="row"><span class="label">KM Retirada:</span><span class="value">${t.km_retirada}</span></div>` : ''}
      ${t.km_devolucao != null ? `<div class="row"><span class="label">KM Devolução:</span><span class="value">${t.km_devolucao}</span></div>` : ''}
      ${t.km_retirada != null && t.km_devolucao != null ? `<div class="row"><span class="label">KM Rodados:</span><span class="value">${Number(t.km_devolucao) - Number(t.km_retirada)}</span></div>` : ''}
      ${t.titulo === 'Aeroporto' ? `<div class="flight"><strong>✈️ Informações do Voo</strong>
        ${t.voo_cidade ? `<div class="row"><span class="label">Cidade:</span><span class="value">${t.voo_cidade}</span></div>` : ''}
        ${t.voo_numero ? `<div class="row"><span class="label">Nº Voo:</span><span class="value">${t.voo_numero}</span></div>` : ''}
        ${t.voo_checkin ? `<div class="row"><span class="label">Check-in:</span><span class="value">${t.voo_checkin}</span></div>` : ''}
        ${t.voo_chegada ? `<div class="row"><span class="label">Chegada:</span><span class="value">${t.voo_chegada}</span></div>` : ''}
        ${t.horario_saida ? `<div class="row"><span class="label">Saída p/ Aeroporto:</span><span class="value">${t.horario_saida}</span></div>` : ''}
      </div>` : ''}
      <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  // Form fields are now in TransportForm component

  return (
    <div className="space-y-4 pb-24">
      {/* ─── Premium Header ─── */}
      <div className="liquid-glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Transportes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Gestão de viagens e logística</p>
          </div>
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="h-9 gap-1.5 rounded-xl shadow-sm active:scale-[0.97] transition-transform"
          >
            <Plus className="w-4 h-4" /> Novo
          </Button>
        </div>
        {/* Status counters */}
        <div className="flex gap-2">
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[11px] font-medium text-accent">{activeCount} em trânsito</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-info/10 border border-info/20">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              <span className="text-[11px] font-medium text-info">{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Create Dialog ─── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Transporte</DialogTitle>
            <DialogDescription>Agende uma nova viagem</DialogDescription>
          </DialogHeader>
          <TransportForm
            data={form}
            setData={setForm}
            isEdit={false}
            guests={guests}
            members={members}
            vehicles={vehicles}
            selectedGuests={selectedGuests}
            setSelectedGuests={setSelectedGuests}
            guestDestinations={guestDestinations}
            setGuestDestinations={setGuestDestinations}
            showNewGuestForm={showNewGuestForm}
            setShowNewGuestForm={setShowNewGuestForm}
            newGuestForm={newGuestForm}
            setNewGuestForm={setNewGuestForm}
            onCreateGuest={(d) => createGuest.mutateAsync(d)}
            createGuestPending={createGuest.isPending}
            includeReturn={includeReturn}
            setIncludeReturn={setIncludeReturn}
            returnForm={returnForm}
            setReturnForm={setReturnForm}
            getDriverCommission={getDriverCommission}
            getVehicleConflictInfo={getVehicleConflictInfo}
            availableVehicles={availableVehicles}
          />
          <Button onClick={handleAdd} className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Salvando...' : 'Agendar Transporte'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ─── Filters ─── */}
      <div className="liquid-glass-card rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setFilterSearch(searchInput); }}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Button size="sm" className="h-9 text-xs shrink-0" onClick={() => setFilterSearch(searchInput)}>Buscar</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Select value={filterMotorista} onValueChange={setFilterMotorista}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motorista" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateTimePicker mode="date" value={filterData} onChange={setFilterData} placeholder="Data" className="h-9 text-xs" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em trânsito</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 text-xs flex-1" onClick={() => { setFilterMotorista(''); setFilterData(''); setFilterStatus(''); setFilterSearch(''); setSearchInput(''); }}>
              <XCircle className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          )}
          <Button
            size="sm"
            variant={showHistory ? 'secondary' : 'ghost'}
            className="h-8 text-xs"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-3.5 h-3.5 mr-1" /> {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
          </Button>
        </div>
      </div>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editForm.status === 'concluido' ? 'Finalizar Viagem' : 'Editar Transporte'}</DialogTitle>
            <DialogDescription>{editForm.status === 'concluido' ? 'Preencha os dados finais da viagem' : 'Atualize os dados do transporte'}</DialogDescription>
          </DialogHeader>
          <TransportForm
            data={editForm}
            setData={(d) => setEditForm({ ...d, status: editForm.status })}
            isEdit={true}
            guests={guests}
            members={members}
            vehicles={vehicles}
            selectedGuests={editGuests}
            setSelectedGuests={setEditGuests}
            showNewGuestForm={editShowNewGuestForm}
            setShowNewGuestForm={setEditShowNewGuestForm}
            newGuestForm={editNewGuestForm}
            setNewGuestForm={setEditNewGuestForm}
            onCreateGuest={(d) => createGuest.mutateAsync(d)}
            createGuestPending={createGuest.isPending}
            getDriverCommission={getDriverCommission}
            getVehicleConflictInfo={getVehicleConflictInfo}
          />
          <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em trânsito</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleEditSave} className="w-full active:scale-[0.97] transition-transform" disabled={update.isPending}>
            {editForm.status === 'concluido' ? '✓ Finalizar Viagem' : 'Salvar'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ─── WhatsApp Dialog ─── */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📋 Texto para WhatsApp</DialogTitle>
            <DialogDescription>Copie e envie ao responsável pela segurança</DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap font-mono border">{whatsappText}</div>
          <Button onClick={() => { navigator.clipboard.writeText(whatsappText); toast.success('Copiado!'); }} className="w-full">
            📋 Copiar Texto
          </Button>
        </DialogContent>
      </Dialog>

      {/* ─── Transport Cards ─── */}
      <div className="space-y-3">
        {filtered.map((t: any) => (
          <TransportCard
            key={t.id}
            t={t}
            members={members}
            vehicles={vehicles}
            guests={guests}
            highlightId={highlightId}
            highlightRef={highlightId === t.id ? highlightRef : undefined}
            trackingTransportId={trackingTransportId}
            locationTracker={locationTracker}
            setTrackingTransportId={setTrackingTransportId}
            isExpanded={expandedCards.has(t.id)}
            onToggleExpand={() => toggleExpand(t.id)}
            onCycleStatus={() => cycleStatus(t)}
            onEdit={() => openEditDlg(t)}
            onDelete={() => remove.mutate(t.id)}
            onDetail={() => openDetail(t)}
            onPDF={() => generatePDF(t)}
            getDriverCommission={getDriverCommission}
            getGuestsForTransport={getGuestsForTransport}
          />
        ))}
        {filtered.length === 0 && (
          <div className="liquid-glass-card rounded-2xl text-center py-16">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted/60 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{hasFilters ? 'Nenhum transporte encontrado' : 'Nenhum transporte cadastrado'}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{hasFilters ? 'Ajuste os filtros para ver mais resultados' : 'Toque em "Novo" para agendar'}</p>
          </div>
        )}
      </div>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {detailTransport && <TransportDetailView t={detailTransport} members={members} vehicles={vehicles} guests={guests} getDriverCommission={getDriverCommission} getGuestsForTransport={getGuestsForTransport} onPDF={() => generatePDF(detailTransport)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
