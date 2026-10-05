import { CheckCircle2, History } from 'lucide-react';
import type { MapActivity } from '../../types';
import { describeLotActivity } from '../../utils/saleActivity';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** Lista do histórico auditável de um lote — compartilhada pela ficha de lote e pela de módulo. */
export function LotActivityList({ items, loading }: { items: MapActivity[] | undefined; loading: boolean }) {
  if (loading) return <p>Carregando histórico auditável…</p>;
  if (!items?.length) return <div className="commercial-map-empty compact"><History /><strong>Nenhuma alteração registrada</strong></div>;
  return <>
    {items.map((item) => {
      const d = describeLotActivity(item);
      return <div key={item.id}>
        <i><CheckCircle2 /></i>
        <span><strong>{d.title}</strong>
          {d.details.map((line) => <small key={line}>{line}</small>)}
          <small>{dateTime.format(new Date(item.createdAt))}</small>
        </span>
      </div>;
    })}
  </>;
}
