import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSaleInspectionStore } from '../../state/useSaleInspectionStore';
import { useSalesStore } from '../../sales/useSalesSelection';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Loader2, Minus, Plus, Search, Undo2, X } from 'lucide-react';
import type { CommercialLot } from '../../types';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import { parseReaisInputToCents } from '../../sales/salesMoney';
import { describeReviseError, fetchSaleOrderRevisions, reviseSaleOrder, type SaleOrderDetail } from './salesOrdersService';
import { previewRevision } from './saleRevision';
import './attach-order-contract.css';
import './revise-sale-order.css';

const centsText = (v: number) => (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReviseSaleOrderDialog({ orderId, detail, lots, locationOf, focusLotId, onClose, onSaved }: {
  focusLotId?: string;
  orderId: string;
  detail: SaleOrderDetail;
  lots: readonly CommercialLot[];
  locationOf: (lotId: string) => string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const h = detail.header;
  const stage = String(h.stage ?? 'RENOVACAO');
  const active = detail.items.filter((i) => ['PENDING_SIGNATURE', 'SIGNED', 'LEGACY_UNVERIFIED'].includes(i.contractState));
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [fees, setFees] = useState({
    admin: centsText(Math.round(Number(h.feeAdmin ?? 0) * 100)),
    ppci: centsText(Math.round(Number(h.feePpci ?? 0) * 100)),
    cleaning: centsText(Math.round(Number(h.feeCleaning ?? 0) * 100)),
  });
  const [count, setCount] = useState(detail.installments.length || Number(h.installmentCount ?? 1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const version = useQuery({ queryKey: ['commercial-sale-order-revisions', orderId], queryFn: () => fetchSaleOrderRevisions(orderId), staleTime: 0 });

  const priceOf = (lot: CommercialLot) => {
    const p = lot.officialPricing2028;
    return (stage === 'RENOVACAO' ? p?.renovacaoTotal : p?.segundaTotal) ?? null;
  };
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);
  const activeLotIds = new Set(active.map((i) => i.lotId));
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return lots.filter((l) => !l.archivedAt && !activeLotIds.has(l.id) && !added.includes(l.id)
      && [l.lotNumber, l.displayName, l.publicIdentifier, l.block, locationOf(l.id)].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, search, added, detail]);

  const addedLots = added.map((id) => lotById.get(id)).filter(Boolean) as CommercialLot[];
  const feesCents = parseReaisInputToCents(fees.admin) + parseReaisInputToCents(fees.ppci) + parseReaisInputToCents(fees.cleaning);
  const originalFees = Math.round((Number(h.feeAdmin ?? 0) + Number(h.feePpci ?? 0) + Number(h.feeCleaning ?? 0)) * 100);
  const unknownPrice = addedLots.some((l) => priceOf(l) === null);
  const preview = previewRevision({
    keptItemTotals: active.filter((i) => !removed.has(i.itemId ?? '')).map((i) => i.itemTotal ?? 0),
    addedItemTotals: addedLots.map((l) => priceOf(l) ?? 0),
    feesCents,
    installments: detail.installments.map((i) => ({ number: i.number, amount: i.amount, paid: Boolean(i.paidAt) || i.paymentStatus === 'PAID' })),
    installmentCount: count,
    originalTotal: Number(h.negotiatedTotal ?? 0),
  });
  const remaining = active.length - removed.size + added.length;
  const changed = removed.size > 0 || added.length > 0 || feesCents !== originalFees || count !== detail.installments.length;
  const contracts = detail.contracts ?? [];
  const hasOrderContract = contracts.some((c) => c.scope === 'ORDER_ITEMS');
  const lotContractWarnings = active.filter((i) => removed.has(i.itemId ?? '') && contracts.some((c) => c.scope === 'LOT' && c.lotIds.includes(i.lotId)))
    .map((i) => lotById.get(i.lotId)?.lotNumber || i.publicIdentifier);
  const paidCount = detail.installments.filter((i) => i.paidAt || i.paymentStatus === 'PAID').length;

  const label = (lotId: string, fallback?: string) => {
    const lot = lotById.get(lotId);
    return `${lot?.displayName || fallback || lot?.publicIdentifier || 'Espaço'} · ${locationOf(lotId)}`;
  };

  const submit = async () => {
    if (submitting.current) return;
    if (!changed) { setError('Nenhuma alteração para salvar.'); return; }
    if (remaining === 0) { setError('A venda precisa manter ao menos um espaço.'); return; }
    if (!reason.trim()) { setError('Informe o motivo da alteração.'); return; }
    if (preview.belowPaid) { setError('O novo total ficaria abaixo do valor já recebido.'); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      await reviseSaleOrder({
        orderId,
        addLotIds: added,
        removeItemIds: Array.from(removed),
        fees: feesCents !== originalFees ? { admin: parseReaisInputToCents(fees.admin) / 100, ppci: parseReaisInputToCents(fees.ppci) / 100, cleaning: parseReaisInputToCents(fees.cleaning) / 100 } : null,
        installmentCount: count !== detail.installments.length ? count : null,
        reason,
        expectedUpdatedAt: version.data?.updatedAt ?? null,
      });
      const removedLotIds = active.filter((i) => removed.has(i.itemId ?? '')).map((i) => i.lotId);
      const inspection = useSaleInspectionStore.getState();
      if (inspection.context && removedLotIds.some((id) => inspection.lotIdSet.has(id))) {
        inspection.start({ ...inspection.context, lotIds: [...inspection.context.lotIds.filter((id) => !removedLotIds.includes(id)), ...added] });
      }
      const sales = useSalesStore.getState();
      added.forEach((id) => sales.removeLot(id));
      await queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-revisions', orderId] });
      await onSaved();
      onClose();
    } catch (e) {
      setError(describeReviseError(e));
      if (String((e as { message?: string })?.message ?? e).includes('ORDER_CHANGED')) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-revisions', orderId] }),
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail'] }),
        ]);
      }
    } finally { submitting.current = false; setBusy(false); }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="cso-attach-overlay" />
      <div className="cso-attach-viewport">
        <Dialog.Content className="cso-attach-dialog rso-dialog" onKeyDown={(e) => e.stopPropagation()}
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
          <header className="cso-attach-header">
            <div>
              <span className="cso-attach-eyebrow">{h.buyerTradeName?.trim() || h.buyerName}</span>
              <Dialog.Title className="cso-attach-title">Editar lotes da venda</Dialog.Title>
              <Dialog.Description className="cso-attach-description">Adicione, retire ou troque espaços. Valores e parcelas em aberto são recalculados.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="cso-attach-close" type="button" aria-label="Fechar edição" disabled={busy}><X aria-hidden="true" /></button></Dialog.Close>
          </header>
          <form className="cso-attach-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="cso-attach-body">
              <section className="cso-attach-section">
                <h3><span aria-hidden="true">01</span> Espaços da venda</h3>
                <ul className="rso-list">
                  {active.map((item) => {
                    const off = removed.has(item.itemId ?? '');
                    return <li key={item.itemId ?? item.lotId} className={`${off ? 'is-removed' : ''}${item.lotId === focusLotId ? ' is-focus' : ''}`}>
                      <span className="rso-name">{label(item.lotId, item.displayName || item.publicIdentifier)}</span>
                      <span className="rso-value">{formatDashboardCurrency(item.itemTotal)}</span>
                      <button type="button" className="rso-icon" disabled={busy || !item.itemId}
                        aria-label={off ? `Manter ${item.publicIdentifier}` : `Retirar ${item.publicIdentifier}`}
                        onClick={() => setRemoved((prev) => { const next = new Set(prev); const id = item.itemId as string; if (next.has(id)) next.delete(id); else next.add(id); return next; })}>
                        {off ? <Undo2 aria-hidden="true" /> : <Minus aria-hidden="true" />}
                      </button>
                    </li>;
                  })}
                  {addedLots.map((lot) => <li key={lot.id} className="is-added">
                    <span className="rso-name">{label(lot.id)} <em>novo</em></span>
                    <span className="rso-value">{priceOf(lot) === null ? 'Preço no servidor' : formatDashboardCurrency(priceOf(lot))}</span>
                    <button type="button" className="rso-icon" disabled={busy} aria-label={`Desfazer ${lot.publicIdentifier}`}
                      onClick={() => setAdded((prev) => prev.filter((id) => id !== lot.id))}><X aria-hidden="true" /></button>
                  </li>)}
                </ul>
                <label className="rso-search"><Search aria-hidden="true" />
                  <input value={search} disabled={busy} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar espaço para adicionar (número, pavilhão, quadra)" aria-label="Buscar espaço para adicionar" />
                </label>
                {search.trim() && <ul className="rso-candidates">
                  {candidates.length === 0 && <li className="rso-empty">Nenhum espaço encontrado.</li>}
                  {candidates.map((lot) => {
                    const free = lot.status === 'AVAILABLE';
                    return <li key={lot.id}>
                      <button type="button" disabled={busy || !free} onClick={() => { setAdded((prev) => [...prev, lot.id]); setSearch(''); }}>
                        <span className="rso-name">{label(lot.id)}</span>
                        <span className="rso-value">{free ? (priceOf(lot) === null ? '—' : formatDashboardCurrency(priceOf(lot))) : lot.status === 'SOLD' ? 'Vendido' : lot.status === 'SALE_OPEN' ? 'Em venda' : 'Indisponível'}</span>
                        {free && <Plus aria-hidden="true" />}
                      </button>
                    </li>;
                  })}
                </ul>}
              </section>

              <section className="cso-attach-section">
                <h3><span aria-hidden="true">02</span> Valores e parcelas</h3>
                <div className="rso-fees">
                  {([['admin', 'Taxa administrativa'], ['ppci', 'PPCI'], ['cleaning', 'Limpeza / licença']] as const).map(([key, text]) =>
                    <label key={key} className="cso-attach-field"><span>{text}</span>
                      <input inputMode="decimal" value={fees[key]} disabled={busy} onChange={(e) => setFees((f) => ({ ...f, [key]: e.target.value }))} /></label>)}
                  <label className="cso-attach-field"><span>Parcelas{paidCount ? ` (${paidCount} recebida${paidCount > 1 ? 's' : ''})` : ''}</span>
                    <input type="number" min={Math.max(1, paidCount)} max={60} value={count} disabled={busy || detail.installments.length === 0}
                      onChange={(e) => setCount(Math.max(Math.max(1, paidCount), Math.min(60, Number(e.target.value) || 1)))} /></label>
                </div>
                <dl className="rso-summary">
                  <div><dt>Total atual</dt><dd>{formatDashboardCurrency(Number(h.negotiatedTotal ?? 0))}</dd></div>
                  <ArrowRight aria-hidden="true" />
                  <div className="is-new"><dt>Novo total</dt><dd>{formatDashboardCurrency(preview.total)}{unknownPrice ? '*' : ''}</dd></div>
                </dl>
                {preview.schedule.length > 0 && <p className="cso-note">
                  {preview.schedule.length} parcela(s): {Array.from(new Set(preview.schedule.filter((i) => !i.paid).map((i) => formatDashboardCurrency(i.amount)))).join(' / ')} em aberto
                  {paidCount ? ' · parcelas recebidas não mudam' : ''}</p>}
                {unknownPrice && <p className="cso-note">* Algum espaço novo terá o preço oficial confirmado ao salvar.</p>}
              </section>

              <section className="cso-attach-section">
                <h3><span aria-hidden="true">03</span> Motivo</h3>
                <label className="cso-attach-field"><span>Motivo da alteração</span>
                  <input value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: troca de módulo a pedido do expositor" /></label>
                <p className="cso-note">Espaços retirados voltam a Disponível. Os novos seguem a situação da venda (em aberto ou vendido). Se houver contrato da venda inteira, considere anexar nova versão.</p>
              </section>
            </div>
            <footer className="cso-attach-footer">
              {changed && <div className="rso-review" aria-live="polite">
                {added.length > 0 && <span>Entram: <strong>{addedLots.map((l) => l.lotNumber || l.publicIdentifier).join(', ')}</strong></span>}
                {removed.size > 0 && <span>Saem: <strong>{active.filter((i) => removed.has(i.itemId ?? '')).map((i) => lotById.get(i.lotId)?.lotNumber || i.publicIdentifier).join(', ')}</strong></span>}
                <span>Total {formatDashboardCurrency(Number(h.negotiatedTotal ?? 0))} → <strong>{formatDashboardCurrency(preview.total)}</strong>
                  {preview.schedule.length > 0 ? ` · ${preview.schedule.length} parcela(s)` : ''}</span>
                {lotContractWarnings.length > 0 && <span className="rso-warn">Contrato individual em {lotContractWarnings.join(', ')}: o arquivo continua no histórico do lote.</span>}
                {hasOrderContract && <span className="rso-warn">Esta venda tem contrato da venda inteira: anexe uma nova versão após salvar.</span>}
                {paidCount > 0 && <span>Valores já recebidos ficam preservados.</span>}
              </div>}
              {error && <p className="cso-attach-state is-error" role="alert">{error}</p>}
              <p><strong>{remaining} {remaining === 1 ? 'espaço' : 'espaços'}</strong><span> após a alteração</span></p>
              <div className="cso-attach-actions">
                <button type="button" className="cso-attach-cancel" disabled={busy} onClick={onClose}>Cancelar</button>
                <button type="submit" className="cso-attach-submit" disabled={busy || !changed || remaining === 0 || version.isLoading}>
                  {busy ? <><Loader2 aria-hidden="true" />Salvando…</> : 'Salvar alterações'}
                </button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
