import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { CommercialLot } from '../types';
import { ExhibitorBookDialog } from '../sales/components/ExhibitorBookDialog';
import { useSalesStore } from '../sales/useSalesSelection';
import { scheduleCommercialMapRefresh } from '../queries/commercialMapRefresh';
import { registerCession } from './cessionService';

export function CreateCession({
  projectId,
  lots,
  onClose,
  onRegistered,
}: {
  projectId: string;
  lots: readonly CommercialLot[];
  onClose: () => void;
  onRegistered: (id: string) => void;
}) {
  const client = useQueryClient();
  const candidates = useMemo(
    () =>
      lots
        .filter(
          (l) =>
            l.status === 'AVAILABLE' &&
            !l.archivedAt &&
            !l.id.startsWith('reference:') &&
            (l.commercialUnit ?? 'SQUARE_METER') === 'SQUARE_METER' &&
            !l.currentBuyer &&
            !l.activeContractNumber,
        )
        .sort((a, b) => a.publicIdentifier.localeCompare(b.publicIdentifier, 'pt-BR', { numeric: true })),
    [lots],
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        useSalesStore
          .getState()
          .selection.map((s) => s.lotId)
          .filter((id) => candidates.some((l) => l.id === id)),
      ),
  );
  const [beneficiary, setBeneficiary] = useState('');
  const [exhibitor, setExhibitor] = useState<string | null>(null);
  const [purpose, setPurpose] = useState('');
  const [search, setSearch] = useState('');
  const [book, setBook] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const chosen = lots
    .filter((l) => selected.has(l.id))
    .sort((a, b) => a.publicIdentifier.localeCompare(b.publicIdentifier, 'pt-BR', { numeric: true }));
  const available = candidates.filter((l) =>
    `${l.publicIdentifier} Quadra ${l.block} Lote ${l.lotNumber} ${l.displayName}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );
  const showAll = search.trim() !== '';
  const visible = available.slice(0, showAll ? 200 : 50);
  const ready =
    !!beneficiary.trim() &&
    !!purpose.trim() &&
    chosen.length > 0 &&
    chosen.length === selected.size &&
    chosen.every((l) => candidates.includes(l));
  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const id = await registerCession(requestId, projectId, beneficiary, exhibitor, purpose, [...selected]);
      selected.forEach((lotId) => useSalesStore.getState().removeLot(lotId));
      void scheduleCommercialMapRefresh(client);
      onRegistered(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a cessão.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="cession-dialog">
        <DialogHeader>
          <DialogTitle>{review ? 'Revisar cessão de espaços' : 'Venda não comercializável'}</DialogTitle>
          <DialogDescription>
            {review
              ? 'Confira o beneficiário e cada lote antes de registrar a destinação.'
              : 'Destine lotes a uma empresa ou a um projeto da Fenasoja.'}
          </DialogDescription>
        </DialogHeader>
        {review ? (
          <>
            <section>
              <h3>{beneficiary}</h3>
              <p>{purpose}</p>
            </section>
            <ul className="cession-lines">
              {chosen.map((l) => (
                <li key={l.id}>
                  <div>
                    <strong>{l.publicIdentifier}</strong>
                    <small>{l.displayName}</small>
                  </div>
                  <span>R$ 0,00</span>
                </li>
              ))}
            </ul>
            <strong className="cession-total">Sem valor comercial · R$ 0,00</strong>
            <div className="cession-actions">
              <Button variant="outline" disabled={busy} onClick={() => setReview(false)}>
                Editar
              </Button>
              <Button disabled={!ready || busy} onClick={confirm}>
                {busy ? 'Registrando…' : 'Registrar e abrir contrato'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <label>
              Beneficiário
              <Input
                value={beneficiary}
                maxLength={200}
                onChange={(e) => {
                  setBeneficiary(e.target.value);
                  setExhibitor(null);
                }}
                placeholder="Empresa ou projeto"
              />
            </label>
            <Button variant="outline" onClick={() => setBook(true)}>
              Selecionar do cadastro
            </Button>
            <ExhibitorBookDialog
              open={book}
              onOpenChange={setBook}
              onSelect={(item) => {
                setBeneficiary(item.tradeName || item.name);
                setExhibitor(item.id);
              }}
            />
            <label>
              Finalidade
              <Input
                value={purpose}
                maxLength={500}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Destinação do espaço"
              />
            </label>
            <section>
              <h3>Escolher lotes</h3>
              <Input
                aria-label="Buscar lotes"
                placeholder="Buscar por quadra, lote ou código"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="cession-picker">
                {visible.map((l) => (
                  <label key={l.id}>
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(l.id);
                          else next.delete(l.id);
                          return next;
                        })
                      }
                    />
                    <strong>{l.publicIdentifier}</strong>
                    <span>{l.displayName}</span>
                  </label>
                ))}
                {!visible.length && <p>Nenhum lote disponível nessa busca.</p>}
              </div>
              {available.length > visible.length && (
                <small>
                  Exibindo {visible.length} de {available.length}. Refine a busca para localizar outro lote.
                </small>
              )}
            </section>
            <Button disabled={!ready} onClick={() => setReview(true)}>
              Revisar cessão · {chosen.length} lote{chosen.length === 1 ? '' : 's'}
            </Button>
          </>
        )}
        {!ready && review && <p role="alert">A disponibilidade mudou. Revise a seleção de lotes.</p>}
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
