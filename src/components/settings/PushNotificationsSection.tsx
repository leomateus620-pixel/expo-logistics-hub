import { BellRing, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { usePushRegistration } from '@/hooks/usePushRegistration';

const STATUS_MESSAGES: Record<string, string> = {
  registered: 'Avisos ativados neste aparelho.',
  'not-configured': 'O serviço de avisos ainda não está configurado. Fale com o administrador.',
  unsupported: 'Este navegador não suporta avisos no celular.',
  'open-in-new-tab': 'Abra o sistema em uma aba própria (ou pelo app instalado) para ativar os avisos.',
  denied: 'Os avisos foram bloqueados. Libere as notificações nas configurações do navegador.',
  error: 'Não foi possível ativar os avisos agora.',
};

export default function PushNotificationsSection() {
  const { status, busy, hasDevice, enable, disable, configured } = usePushRegistration();

  const handleEnable = async () => {
    const result = await enable();
    if (result === 'registered') {
      toast.success(STATUS_MESSAGES.registered);
    } else {
      toast.error(STATUS_MESSAGES[result] ?? STATUS_MESSAGES.error);
    }
  };

  const handleDisable = async () => {
    await disable();
    toast.success('Avisos desativados neste aparelho.');
  };

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <BellRing className="w-4 h-4" /> Avisos no celular
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Receba os mesmos lembretes de evento que chegam por e-mail direto na tela do aparelho.
          </p>
        </div>
        {hasDevice && <Badge className="shrink-0">Ativo</Badge>}
      </div>

      {!configured && (
        <p className="text-sm text-muted-foreground mb-3">
          {STATUS_MESSAGES['not-configured']}
        </p>
      )}

      {status !== 'idle' && status !== 'registered' && (
        <p className="text-sm text-destructive mb-3">{STATUS_MESSAGES[status]}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleEnable} disabled={busy || !configured} className="h-11 rounded-xl">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
          {hasDevice ? 'Reativar neste aparelho' : 'Ativar avisos'}
        </Button>
        {hasDevice && (
          <Button variant="outline" onClick={handleDisable} disabled={busy} className="h-11 rounded-xl">
            Desativar
          </Button>
        )}
      </div>
    </div>
  );
}
