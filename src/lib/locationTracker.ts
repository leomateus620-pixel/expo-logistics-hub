/**
 * Singleton de geolocation para a aba.
 *
 * Garante que existe APENAS UM `watchPosition` ativo por aba do navegador,
 * mesmo que múltiplos componentes montem `useLocationTracking`. Também isola
 * o tracking por dispositivo (`tracking_device_id` no banco), evitando que
 * o mesmo motorista logado em outro aparelho/aba sobrescreva a localização
 * que o celular já está enviando.
 */

import { supabase } from '@/integrations/supabase/client';

const ACTIVE_STATUSES = new Set(['em_andamento', 'em_retorno', 'chegou_destino']);
const DEVICE_KEY = 'fenasoja_device_id';

export interface TrackerSnapshot {
  isTracking: boolean;
  transportId: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  error: string | null;
}

type Listener = (s: TrackerSnapshot) => void;

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `mem-${Date.now()}`;
  }
}

class LocationTracker {
  private watchId: number | null = null;
  private currentTransportId: string | null = null;
  private currentUserId: string | null = null;
  private deviceId: string = getOrCreateDeviceId();
  private state: TrackerSnapshot = {
    isTracking: false,
    transportId: null,
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    error: null,
  };
  private listeners = new Set<Listener>();
  private logs: string[] = [];
  private logListeners = new Set<(logs: string[]) => void>();

  getDeviceId() { return this.deviceId; }
  getSnapshot(): TrackerSnapshot { return this.state; }
  getLogs(): string[] { return this.logs; }

  subscribeLogs(fn: (logs: string[]) => void): () => void {
    this.logListeners.add(fn);
    fn(this.logs);
    return () => { this.logListeners.delete(fn); };
  }

  private pushLog(msg: string) {
    const stamped = `${new Date().toISOString().slice(11, 19)} ${msg}`;
    this.logs = [...this.logs.slice(-19), stamped];
    try { console.info(msg); } catch { /* */ }
    for (const fn of this.logListeners) fn(this.logs);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  private setState(patch: Partial<TrackerSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /**
   * Inicia (ou troca) o tracking para um transportId/userId.
   * Se já houver tracking ativo para outro transporte, o anterior é
   * encerrado limpamente antes de abrir o novo `watchPosition`.
   */
  async start(transportId: string, userId: string): Promise<void> {
    if (!transportId || !userId) return;

    // Trocou de transporte → fecha o watch antigo antes de abrir novo
    if (this.currentTransportId && this.currentTransportId !== transportId) {
      this.stopInternal();
    }
    // Mesmo transporte e mesmo user já ativos → no-op
    if (
      this.currentTransportId === transportId &&
      this.currentUserId === userId &&
      this.watchId !== null
    ) {
      return;
    }

    this.currentTransportId = transportId;
    this.currentUserId = userId;
    this.setState({ isTracking: true, transportId, error: null });
    this.pushLog(`[gps:start] transport=${transportId} user=${userId}`);

    if (!navigator.geolocation) {
      this.setState({ error: 'Geolocalização não suportada neste navegador', isTracking: false });
      this.pushLog('[gps:start] geolocation API ausente');
      return;
    }

    // Trava extra: confirma no banco que o usuário é o motorista designado.
    // Se não for, aborta antes mesmo de pedir permissão ao navegador.
    // (Backend já bloqueia, mas isso evita pedir GPS para visualizadores.)
    try {
      const { data: t } = await (supabase as any)
        .from('transports')
        .select('motorista_user_id, status')
        .eq('id', transportId)
        .maybeSingle();
      if (t && t.motorista_user_id && t.motorista_user_id !== userId) {
        this.setState({
          isTracking: false,
          transportId: null,
          error: 'Apenas o motorista designado pode ativar o GPS desta viagem.',
        });
        this.pushLog('[gps:start-block] usuário não é o motorista designado');
        this.currentTransportId = null;
        this.currentUserId = null;
        return;
      }
    } catch { /* segue mesmo offline — backend ainda bloqueia */ }

    // IMPORTANTE: NÃO usar `await` antes de chamar `getCurrentPosition`/`watchPosition`
    // — em iOS/Safari isso quebra o "user gesture" e a permissão falha silenciosamente.
    // A consulta de permissão acontece em paralelo apenas para feedback.
    try {
      navigator.permissions
        ?.query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          if (perm.state === 'denied') {
            this.setState({
              error: 'Localização bloqueada. Acesse as configurações do navegador para permitir.',
            });
          }
        })
        .catch(() => { /* ignora */ });
    } catch { /* permissions API ausente em alguns browsers */ }

    // Fix imediato (dentro do gesto)
    navigator.geolocation.getCurrentPosition(
      (pos) => { void this.publish(pos); },
      (err) => {
        let msg = 'Erro ao obter localização';
        if (err.code === 1) msg = 'Permissão de localização negada. Ative nas configurações do navegador.';
        if (err.code === 2) msg = 'Localização indisponível';
        if (err.code === 3) msg = 'Tempo esgotado ao obter localização';
        this.setState({ error: msg });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => { void this.publish(pos); },
      (err) => {
        let msg = 'Erro ao obter localização';
        if (err.code === 1) msg = 'Permissão de localização negada. Ative nas configurações do navegador.';
        if (err.code === 2) msg = 'Localização indisponível';
        if (err.code === 3) msg = 'Tempo esgotado ao obter localização';
        this.setState({ error: msg });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  /** Encerra o tracking do transporte atual (se for ele). */
  stop(transportId?: string) {
    if (transportId && this.currentTransportId !== transportId) return;
    this.stopInternal();
  }

  private stopInternal(opts: { keepCoords?: boolean } = {}) {
    if (this.watchId !== null) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch { /* silent */ }
      this.watchId = null;
    }
    this.currentTransportId = null;
    this.currentUserId = null;
    if (opts.keepCoords) {
      this.setState({ isTracking: false, transportId: null });
    } else {
      this.setState({
        isTracking: false,
        transportId: null,
        latitude: null,
        longitude: null,
        accuracy: null,
        speed: null,
      });
    }
  }

  private async publish(pos: GeolocationPosition) {
    const tid = this.currentTransportId;
    const uid = this.currentUserId;
    if (!tid || !uid) return;

    // Validação leve antes de gastar RPC
    try {
      const { data: t } = await (supabase as any)
        .from('transports')
        .select('status, motorista_user_id, tracking_started_by_user_id, tracking_device_id')
        .eq('id', tid)
        .maybeSingle();

      if (!t) { this.stopInternal(); return; }
      if (!ACTIVE_STATUSES.has(t.status)) { this.stopInternal(); return; }

      // Só o motorista designado publica
      if (t.motorista_user_id && t.motorista_user_id !== uid) {
        this.stopInternal();
        return;
      }
      // Outro user já dono do GPS desta viagem
      if (t.tracking_started_by_user_id && t.tracking_started_by_user_id !== uid) {
        this.stopInternal();
        return;
      }
      // Outro DISPOSITIVO do mesmo user já dono
      if (t.tracking_device_id && t.tracking_device_id !== this.deviceId) {
        this.setState({
          error: 'Outro dispositivo já está enviando a localização desta viagem.',
        });
        this.stopInternal();
        return;
      }
    } catch { /* segue tentando publicar mesmo offline */ }

    const { latitude, longitude, accuracy, speed, heading } = pos.coords;

    this.setState({
      latitude, longitude, accuracy,
      speed: speed ?? null,
      error: null,
    });
    this.pushLog(`[gps:fix] lat=${latitude.toFixed(6)} lng=${longitude.toFixed(6)} acc=${Math.round(accuracy || 0)}m`);

    try {
      const { error: rpcErr } = await (supabase as any).rpc('publish_transport_location', {
        _transport_id: tid,
        _latitude: latitude,
        _longitude: longitude,
        _accuracy: accuracy ?? null,
        _speed: speed ?? null,
        _heading: heading ?? null,
        _device_id: this.deviceId,
        _user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      });
      if (rpcErr) {
        const msg = String(rpcErr.message || rpcErr);
        if (/dispositivo|Outro usu/i.test(msg)) {
          this.setState({ error: msg });
          this.pushLog(`[gps:publish-block] ${msg}`);
          this.stopInternal();
          return;
        }
        console.warn('[gps] publish recoverable error:', msg);
        this.setState({ error: 'Tentando reconectar a localização…' });
        this.pushLog(`[gps:publish-error] ${msg}`);
      } else {
        this.pushLog('[gps:publish-ok]');
      }
    } catch (err) {
      console.warn('[gps] publish exception (will retry):', err);
      this.setState({ error: 'Conexão instável — tentando novamente…' });
      this.pushLog(`[gps:publish-exception] ${String(err)}`);
    }
  }
}

export const locationTracker = new LocationTracker();
