import { memo } from 'react';
import { BellRing, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePushRegistration } from '@/hooks/usePushRegistration';

const STATUS_MESSAGES: Record<string, string> = {
  registered: 'Avisos ativados neste aparelho.',
  'not-configured': 'O serviço de avisos ainda não está configurado. Fale com o administrador.',
  unsupported: 'Este navegador não suporta avisos no celular.',
  'open-in-new-tab': 'Abra o sistema em uma aba própria (ou pelo app instalado) para ativar os avisos.',
  denied: 'Os avisos foram bloqueados. Libere as notificações nas configurações do navegador.',
  error: 'Não foi possível ativar os avisos agora.',
};

/** Compact push notification control living inside the Agenda Fenasoja command bar. */
export const CronogramaPushStatusButton = memo(function CronogramaPushStatusButton() {
  const { status, busy, hasDevice, enable, disable, configured } = usePushRegistration();

  const signal = busy ? 'busy' : hasDevice ? 'connected' : configured ? 'offline' : 'attention';

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

  const stateLabel = hasDevice
    ? 'Avisos ativos neste aparelho'
    : configured
      ? 'Avisos desativados neste aparelho'
      : 'Serviço de avisos indisponível';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cronograma-command-chip focus-ring"
          data-signal={signal}
          aria-label={`Avisos no celular: ${stateLabel}`}
        >
          <span className="cronograma-command-chip__glyph" aria-hidden="true">
            <BellRing className="h-[18px] w-[18px]" />
          </span>
          <span className="cronograma-command-signal" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="cronograma-command-popover">
        <header className="cronograma-command-popover__head">
          <BellRing className="h-[22px] w-[22px]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="cronograma-command-popover__eyebrow">Notificações</p>
            <h3 className="cronograma-command-popover__title">Avisos no celular</h3>
          </div>
        </header>

        <p className="cronograma-command-popover__state" data-signal={signal}>
          <span className="cronograma-command-signal" aria-hidden="true" />
          {stateLabel}
        </p>

        <p className="cronograma-command-popover__text">
          O aviso chega 1 hora antes do evento e também quando você é vinculado a um evento.
        </p>

        {!configured && (
          <p className="cronograma-command-popover__text">{STATUS_MESSAGES['not-configured']}</p>
        )}

        {status !== 'idle' && status !== 'registered' && configured && (
          <p className="cronograma-command-popover__text">{STATUS_MESSAGES[status]}</p>
        )}

        <div className="cronograma-command-popover__actions">
          <button
            type="button"
            className="cronograma-command-popover__cta"
            onClick={handleEnable}
            disabled={busy || !configured}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Smartphone aria-hidden="true" />}
            <span>{hasDevice ? 'Reativar neste aparelho' : 'Ativar avisos'}</span>
          </button>

          {hasDevice && (
            <button
              type="button"
              className="cronograma-command-popover__ghost"
              onClick={handleDisable}
              disabled={busy}
            >
              <span>Desativar</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
