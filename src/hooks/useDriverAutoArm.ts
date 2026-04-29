import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTransports } from '@/hooks/useTransports';
import { locationTracker } from '@/lib/locationTracker';

const ACTIVE = ['em_andamento', 'em_retorno', 'chegou_destino'];
const PRIORITY: Record<string, number> = { em_retorno: 0, em_andamento: 1, chegou_destino: 2 };
const TRACKING_KEY = 'fenasoja_tracking';

/**
 * Reivindica o GPS do motorista designado em qualquer rota do app.
 * Estratégia (mesma já validada na TransportsPage):
 *   1) Já sou dono no DB → continuo.
 *   2) Cache local aponta uma viagem que ainda é minha → continuo.
 *   3) Sou `motorista_user_id` de uma viagem ativa sem dono → reivindico.
 * Não publica nada por conta própria — apenas inicia o `locationTracker`,
 * que já cuida de toda validação por usuário/dispositivo no banco.
 */
export function useDriverAutoArm() {
  const { user } = useAuth();
  const { transports } = useTransports();

  useEffect(() => {
    if (!user?.id || !transports || transports.length === 0) return;

    // 1) Ownership já registrado no banco
    const owned = transports.find(
      (t: any) => ACTIVE.includes(t.status) && t.tracking_started_by_user_id === user.id,
    );
    if (owned) {
      void locationTracker.start(owned.id, user.id);
      try {
        localStorage.setItem(
          TRACKING_KEY,
          JSON.stringify({ transportId: owned.id, userId: user.id, phase: owned.fase_atual || 'ida', startedAt: new Date().toISOString() }),
        );
      } catch { /* ignore */ }
      return;
    }

    // 2) Cache local
    let stored: { transportId: string; userId: string } | null = null;
    try {
      const raw = localStorage.getItem(TRACKING_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore */ }
    if (stored && stored.userId === user.id) {
      const t = transports.find((x: any) => x.id === stored!.transportId);
      const stillMine =
        t &&
        ACTIVE.includes(t.status) &&
        (!t.tracking_started_by_user_id || t.tracking_started_by_user_id === user.id);
      if (stillMine) {
        void locationTracker.start(stored.transportId, user.id);
        return;
      }
      try { localStorage.removeItem(TRACKING_KEY); } catch { /* ignore */ }
    }

    // 3) Designated driver auto-claim
    const candidates = transports
      .filter(
        (t: any) =>
          ACTIVE.includes(t.status) &&
          t.motorista_user_id === user.id &&
          (!t.tracking_started_by_user_id || t.tracking_started_by_user_id === user.id),
      )
      .sort((a: any, b: any) => {
        const pa = PRIORITY[a.status] ?? 9;
        const pb = PRIORITY[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.inicio_em || 0).getTime() - new Date(a.inicio_em || 0).getTime();
      });
    if (candidates.length > 0) {
      const pick = candidates[0];
      void locationTracker.start(pick.id, user.id);
      try {
        localStorage.setItem(
          TRACKING_KEY,
          JSON.stringify({ transportId: pick.id, userId: user.id, phase: pick.fase_atual || 'ida', startedAt: new Date().toISOString() }),
        );
      } catch { /* ignore */ }
    }
  }, [user?.id, transports]);
}
