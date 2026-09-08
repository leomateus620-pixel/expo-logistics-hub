import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { usePushRegistration } from '@/hooks/usePushRegistration';

const DISMISS_KEY = 'fenasoja:push-prompt-dismissed';

/**
 * Convite discreto para ativar os avisos no celular.
 * Aparece uma vez por aparelho, só para quem já está logado e ainda não decidiu.
 * Quem recusar continua podendo ativar em Configurações.
 */
export default function PushPermissionPrompt() {
  const { user } = useAuth();
  const { enable, busy, hasDevice, configured } = usePushRegistration();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user?.id || !configured || hasDevice) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.top !== window.self) return; // pré-visualização em quadro: o navegador ignora o pedido
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(timer);
  }, [user?.id, configured, hasDevice]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const accept = async () => {
    const result = await enable();
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    if (result === 'registered') toast.success('Avisos ativados neste aparelho.');
    else toast.error('Não foi possível ativar os avisos. Tente em Configurações.');
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-border/60 bg-card/95 p-4 shadow-xl backdrop-blur">
      <button
        onClick={dismiss}
        aria-label="Fechar"
        className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="font-semibold">Quer receber os lembretes no celular?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os mesmos lembretes de evento que chegam por e-mail, direto na tela do aparelho.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={accept} disabled={busy} className="h-10 rounded-xl">
              Ativar avisos
            </Button>
            <Button onClick={dismiss} variant="ghost" className="h-10 rounded-xl">
              Agora não
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
