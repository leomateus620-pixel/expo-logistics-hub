import { formatBrl } from './lotPricing2028';
import { describePriceActivity } from './priceActivity';

interface ActivityLike { action: string; beforeState: unknown; afterState: unknown; reason?: string | null }

const read = (s: unknown): Record<string, unknown> => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {});
const money = (v: unknown) => (v === null || v === undefined ? null : formatBrl(Number(v)));
const lotsText = (v: unknown) => (Array.isArray(v) && v.length ? v.map((x) => String(x).replace(/^B5-M0*/, '')).join(', ') : null);

const STATUS: Record<string, string> = { AVAILABLE: 'Disponível', SALE_OPEN: 'Venda em aberto', SOLD: 'Vendido', BLOCKED: 'Bloqueado' };

/** Texto legível do histórico do lote (vendas, edições de venda e preços). */
export function describeLotActivity(item: ActivityLike): { title: string; details: string[] } {
  const price = describePriceActivity(item);
  if (price) return { title: price.title, details: [price.detail, price.actor].filter(Boolean) as string[] };
  const a = read(item.afterState);
  const buyer = typeof a.buyer === 'string' && a.buyer ? a.buyer : null;
  const of = buyer ? ` de ${buyer}` : '';
  const details: string[] = [];
  const before = lotsText(a.lots_before); const after = lotsText(a.lots_after);
  if (before && after) details.push(`Espaços: ${before} → ${after}`);
  const tb = money(a.total_before); const ta = money(a.total_after);
  if (tb && ta) details.push(tb === ta ? `Total mantido: ${ta}` : `Total: ${tb} → ${ta}`);
  if (a.installments_before != null && a.installments_after != null && a.installments_before !== a.installments_after) {
    details.push(`Parcelas: ${a.installments_before} → ${a.installments_after}`);
  }
  if (item.reason) details.push(`Motivo: ${item.reason}`);
  switch (item.action) {
    case 'LOT_SALE_ITEM_ADDED':
      return { title: `Adicionado à venda${of}`, details: [`Situação: ${STATUS[String(a.status)] ?? String(a.status ?? '—')}`, ...details] };
    case 'LOT_SALE_ITEM_REMOVED':
      return { title: `Retirado da venda${of}`, details: ['Voltou a Disponível', ...details] };
    case 'LOT_SALE_ORDER_REVISED':
      return { title: `Venda${of} alterada`, details: ['Este espaço permaneceu na venda', ...details] };
    case 'LOT_SALE_CONFIRMED':
      return { title: 'Contrato assinado confirmado', details: ['Situação: Vendido', ...(item.reason ? [] : [])] };
    case 'LOT_SALE_CANCELLED':
      return { title: 'Venda em aberto cancelada', details: ['Voltou a Disponível', ...(item.reason ? [`Motivo: ${item.reason}`] : [])] };
    default:
      return { title: item.action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), details: item.reason ? [item.reason] : [] };
  }
}
