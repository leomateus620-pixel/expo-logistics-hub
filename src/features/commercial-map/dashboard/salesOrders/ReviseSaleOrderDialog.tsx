import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSaleInspectionStore } from '../../state/useSaleInspectionStore';
import { useSalesStore } from '../../sales/useSalesSelection';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, ChevronDown, Loader2, Plus, Search, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CommercialLot, MapEntity } from '../../types';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import { parseReaisInputToCents } from '../../sales/salesMoney';
import { describeReviseError, fetchSaleOrderRevisions, reviseSaleOrder, type SaleOrderDetail } from './salesOrdersService';
import { previewRevision } from './saleRevision';
import {
  buildAutomaticRevisionReason,
  candidateDisabledReason,
  commercialStatusLabel,
  matchesLotSearch,
  scopeForLot,
} from './saleLotRevisionSelection';
import './attach-order-contract.css';
import './revise-sale-order.css';

const centsText = (v: number) => (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReviseSaleOrderDialog({ orderId, detail, lots, entities, locationOf, focusLotId, onClose, onSaved }: {
  focusLotId?: string;
  orderId: string;
  detail: SaleOrderDetail;
  lots: readonly CommercialLot[];
  entities: readonly MapEntity[];
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
  const [showNote, setShowNote] = useState(false);
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
  const activeLotIds = useMemo(() => new Set(active.map((i) => i.lotId)), [active]);
  const scopes = useMemo(() => {
    const unique = new Map<string, ReturnType<typeof scopeForLot>>();
    active.forEach((item) => {
      const lot = lotById.get(item.lotId);
      const scope = lot ? scopeForLot(lot, entities) : null;
      if (scope) unique.set(scope.key, scope);
    });
    return Array.from(unique.values()).filter(Boolean) as NonNullable<ReturnType<typeof scopeForLot>>[];
  }, [active, entities, lotById]);
  const [scopeKey, setScopeKey] = useState<string>(() => scopes[0]?.key ?? '');
  const selectedScope = scopes.find((scope) => scope.key === scopeKey) ?? scopes[0] ?? null;
  const candidates = useMemo(() => {
    if (!search.trim() || !selectedScope) return [];
    return lots
      .filter((lot) => {
        const scope = scopeForLot(lot, entities);
        return !lot.archivedAt
          && !activeLotIds.has(lot.id)
          && !added.includes(lot.id)
          && scope?.key === selectedScope.key
          && scope.projectId === selectedScope.projectId
          && matchesLotSearch(lot, locationOf(lot.id), search);
      })
      .sort((a, b) => Number(b.status === 'AVAILABLE') - Number(a.status === 'AVAILABLE')
        || String(a.lotNumber ?? a.publicIdentifier).localeCompare(String(b.lotNumber ?? b.publicIdentifier), 'pt-BR', { numeric: true }))
      .slice(0, 30);
  }, [activeLotIds, added, entities, locationOf, lots, search, selectedScope]);

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
    if (preview.belowPaid) { setError('O novo total ficaria abaixo do valor já recebido.'); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      await reviseSaleOrder({
        orderId,
        addLotIds: added,
        removeItemIds: Array.from(removed),
        fees: feesCents !== originalFees ? { admin: parseReaisInputToCents(fees.admin) / 100, ppci: parseReaisInputToCents(fees.ppci) / 100, cleaning: parseReaisInputToCents(fees.cleaning) / 100 } : null,
        installmentCount: count !== detail.installments.length ? count : null,
        reason: reason.trim() || buildAutomaticRevisionReason(
          addedLots.map((lot) => lot.publicIdentifier),
          active.filter((item) => removed.has(item.itemId ?? '')).map((item) => item.publicIdentifier),
        ),
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
            <Dialog.Close asChild><Button className="cso-attach-close" type="button" variant="outline" size="icon" aria-label="Fechar edição" disabled={busy}><X aria-hidden="true" /></Button></Dialog.Close>
          </header>
          <form className="cso-attach-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="cso-attach-body">
              <section className="cso-attach-section">
                <h3><span aria-hidden="true">01</span> Lotes atuais da venda</h3>
                <ul className="rso-list">
                  {active.map((item) => {
                    const off = removed.has(item.itemId ?? '');
                    return <li key={item.itemId ?? item.lotId} className={`${off ? 'is-removed' : ''}${item.lotId === focusLotId ? ' is-focus' : ''}`}>
                      <span className="rso-card-copy"><span className="rso-name">{label(item.lotId, item.displayName || item.publicIdentifier)}</span>{off && <span className="rso-change-state">Será retirado</span>}</span>
                      <span className="rso-value">{formatDashboardCurrency(item.itemTotal)}</span>
                      <Button type="button" variant="outline" size="sm" className="rso-action" disabled={busy || !item.itemId}
                        onClick={() => setRemoved((prev) => { const next = new Set(prev); const id = item.itemId as string; if (next.has(id)) next.delete(id); else next.add(id); return next; })}>
                        {off && <Undo2 aria-hidden="true" />}{off ? 'Manter' : 'Retirar'}
                      </Button>
                    </li>;
                  })}
                </ul>
                {addedLots.length > 0 && <div className="rso-added-group">
                  <h4>Adicionados nesta alteração</h4>
                  <ul className="rso-list">
                    {addedLots.map((lot) => <li key={lot.id} className="is-added">
                      <span className="rso-card-copy"><span className="rso-name">{label(lot.id)}</span><span className="rso-change-state">Entrará na venda</span></span>
                      <span className="rso-value">{priceOf(lot) === null ? 'Sem preço' : formatDashboardCurrency(priceOf(lot))}</span>
                      <Button type="button" variant="outline" size="sm" className="rso-action" disabled={busy}
                        onClick={() => setAdded((prev) => prev.filter((id) => id !== lot.id))}><Undo2 aria-hidden="true" />Desfazer</Button>
                    </li>)}
                  </ul>
                </div>}
                <div className="rso-add-area">
                  <div className="rso-add-heading">
                    <div><h4>Adicionar lotes</h4><p>Pesquisa restrita a <strong>{selectedScope?.label ?? 'local não identificado'}</strong>.</p></div>
                    {scopes.length > 1 && <label><span>Local da venda</span><select value={selectedScope?.key ?? ''} onChange={(event) => { setScopeKey(event.target.value); setSearch(''); }} disabled={busy}>{scopes.map((scope) => <option key={scope.key} value={scope.key}>{scope.label}</option>)}</select></label>}
                  </div>
                <label className="rso-search"><Search aria-hidden="true" />
                  <input value={search} disabled={busy || !selectedScope} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número, código ou nome" aria-label="Buscar lote para adicionar" />
                </label>
                {search.trim() && <ul className="rso-candidates">
                  {candidates.length === 0 && <li className="rso-empty">Nenhum lote encontrado neste local.</li>}
                  {candidates.map((lot) => {
                    const disabledReason = candidateDisabledReason(lot, priceOf(lot));
                    const phase = lot.status === 'AVAILABLE' ? 'available' : lot.status === 'SALE_OPEN' ? 'open' : lot.status === 'SOLD' ? 'sold' : 'blocked';
                    return <li key={lot.id} className={`is-${phase}`}>
                      <div className="rso-candidate-copy"><span className="rso-name">{lot.displayName || lot.publicIdentifier}</span><small>{lot.publicIdentifier} · {locationOf(lot.id)}</small></div>
                      <span className={`rso-status is-${phase}`}>{commercialStatusLabel(lot)}</span>
                      <span className="rso-value">{priceOf(lot) === null ? 'Sem preço oficial' : formatDashboardCurrency(priceOf(lot))}</span>
                      <Button type="button" size="sm" variant={disabledReason ? 'outline' : 'default'} disabled={busy || Boolean(disabledReason)}
                        title={disabledReason ?? undefined} onClick={() => setAdded((prev) => [...prev, lot.id])}>
                        {!disabledReason && <Plus aria-hidden="true" />}{disabledReason ?? 'Adicionar'}
                      </Button>
                    </li>;
                  })}
                </ul>}
                </div>
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

              <section className="cso-attach-section rso-note-section">
                <Button type="button" variant="ghost" className="rso-note-trigger" aria-expanded={showNote} onClick={() => setShowNote((value) => !value)}>
                  <ChevronDown aria-hidden="true" className={showNote ? 'is-open' : ''} /> Adicionar observação <span>(opcional)</span>
                </Button>
                {showNote && <label className="cso-attach-field"><span>Observação da alteração</span>
                  <input value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: troca solicitada pelo expositor" /></label>}
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
                <Button type="button" variant="outline" className="cso-attach-cancel" disabled={busy} onClick={onClose}>Cancelar</Button>
                <Button type="submit" className="cso-attach-submit" disabled={busy || !changed || remaining === 0 || version.isLoading}>
                  {busy ? <><Loader2 aria-hidden="true" />Salvando…</> : 'Salvar alterações'}
                </Button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
