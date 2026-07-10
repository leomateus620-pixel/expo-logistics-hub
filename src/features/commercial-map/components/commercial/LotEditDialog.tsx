import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, PencilLine, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useMapMutations } from '../../hooks/useCommercialMap';
import type { CommercialLot, PricingMode } from '../../types';
import { calculateAskingPrice } from '../../utils/geometry';

interface Props {
  lot: CommercialLot;
  open: boolean;
  onClose: () => void;
}

function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function LotEditDialog({ lot, open, onClose }: Props) {
  const { lotUpdate } = useMapMutations();
  const [publicIdentifier, setPublicIdentifier] = useState(lot.publicIdentifier);
  const [displayName, setDisplayName] = useState(lot.displayName);
  const [description, setDescription] = useState(lot.description ?? '');
  const [block, setBlock] = useState(lot.block ?? '');
  const [lotNumber, setLotNumber] = useState(lot.lotNumber ?? '');
  const [levelLabel, setLevelLabel] = useState(lot.levelLabel ?? '');
  const [officialArea, setOfficialArea] = useState(lot.officialAreaSqm?.toString() ?? '');
  const [areaValidated, setAreaValidated] = useState(lot.areaValidationStatus === 'VALIDATED');
  const [frontage, setFrontage] = useState(lot.frontageMeters?.toString() ?? '');
  const [depth, setDepth] = useState(lot.depthMeters?.toString() ?? '');
  const [pricingMode, setPricingMode] = useState<PricingMode>(lot.pricingMode);
  const [fixedTotal, setFixedTotal] = useState(lot.pricingMode === 'FIXED_TOTAL' ? (lot.basePrice ?? lot.askingPrice)?.toString() ?? '' : '');
  const [pricePerSqm, setPricePerSqm] = useState(lot.pricePerSqm?.toString() ?? '');
  const [minimumPrice, setMinimumPrice] = useState(lot.minimumPrice?.toString() ?? '');
  const [infrastructure, setInfrastructure] = useState(lot.infrastructure.join(', '));
  const [hasElectricity, setHasElectricity] = useState(lot.hasElectricity);
  const [hasWater, setHasWater] = useState(lot.hasWater);
  const [hasInternet, setHasInternet] = useState(lot.hasInternet);
  const [isCorner, setIsCorner] = useState(lot.isCorner);
  const [isCovered, setIsCovered] = useState(lot.isCovered);
  const [accessibilityNotes, setAccessibilityNotes] = useState(lot.accessibilityNotes ?? '');
  const [commercialNotes, setCommercialNotes] = useState(lot.commercialNotes ?? '');
  const [internalNotes, setInternalNotes] = useState(lot.internalNotes ?? '');
  const [reason, setReason] = useState('Atualização cadastral e comercial');

  const pricing = useMemo(() => calculateAskingPrice({
    pricingMode,
    fixedTotal: numeric(fixedTotal),
    pricePerSqm: numeric(pricePerSqm),
    officialAreaSqm: numeric(officialArea),
    areaValidationStatus: areaValidated ? 'VALIDATED' : 'UNVALIDATED',
  }), [areaValidated, fixedTotal, officialArea, pricePerSqm, pricingMode]);
  const minimum = numeric(minimumPrice);
  const minimumInvalid = minimum !== null && (minimum < 0 || (pricing.value !== null && minimum > pricing.value));
  const dimensionsInvalid = [officialArea, frontage, depth].some((value) => value && (numeric(value) === null || numeric(value)! <= 0));
  const ready = Boolean(lot.updatedAt && publicIdentifier.trim() && displayName.trim() && reason.trim()
    && !pricing.warning && !minimumInvalid && !dimensionsInvalid && (!areaValidated || numeric(officialArea)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lot.updatedAt || !ready) return;
    try {
      await lotUpdate.mutateAsync({
        lotId: lot.id,
        expectedUpdatedAt: lot.updatedAt,
        patch: {
          publicIdentifier: publicIdentifier.trim(), displayName: displayName.trim(), description: description.trim(),
          block: block.trim(), lotNumber: lotNumber.trim(), levelLabel: levelLabel.trim(), officialAreaSqm: numeric(officialArea),
          areaValidationStatus: areaValidated ? 'VALIDATED' : 'UNVALIDATED', frontageMeters: numeric(frontage), depthMeters: numeric(depth),
          pricingMode, fixedTotal: numeric(fixedTotal), pricePerSqm: numeric(pricePerSqm), minimumPrice: minimum,
          infrastructure: infrastructure.split(',').map((item) => item.trim()).filter(Boolean),
          hasElectricity, hasWater, hasInternet, isCorner, isCovered,
          accessibilityNotes: accessibilityNotes.trim(), commercialNotes: commercialNotes.trim(), internalNotes: internalNotes.trim(),
        },
        reason: reason.trim(),
      });
      onClose();
    } catch {
      // Keep the form available for correction after the mutation toast explains the error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[820px] p-0 overflow-hidden">
        <form onSubmit={submit}>
          <DialogHeader className="px-6 pt-6">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><PencilLine className="h-5 w-5" /></div>
            <DialogTitle>Editar {lot.publicIdentifier}</DialogTitle>
            <DialogDescription>Cadastro, medidas oficiais e preço são salvos juntos com controle de concorrência e histórico.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[68dvh] px-6">
            <div className="commercial-map-lot-edit-grid py-5">
              <h3>Identificação</h3>
              <label><Label>Identificador público *</Label><Input value={publicIdentifier} onChange={(event) => setPublicIdentifier(event.target.value)} /></label>
              <label><Label>Nome de exibição *</Label><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <label><Label>Bloco</Label><Input value={block} onChange={(event) => setBlock(event.target.value)} /></label>
              <label><Label>Número do lote</Label><Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} /></label>
              <label><Label>Piso / nível</Label><Input value={levelLabel} onChange={(event) => setLevelLabel(event.target.value)} placeholder="Ex.: Térreo" /></label>
              <label className="is-full"><Label>Descrição</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label>

              <h3>Medidas oficiais</h3>
              <label><Label>Área oficial (m²)</Label><Input type="number" min="0" step="0.01" value={officialArea} onChange={(event) => { setOfficialArea(event.target.value); if (!event.target.value) setAreaValidated(false); }} /></label>
              <label><Label>Testada (m)</Label><Input type="number" min="0" step="0.01" value={frontage} onChange={(event) => setFrontage(event.target.value)} /></label>
              <label><Label>Profundidade (m)</Label><Input type="number" min="0" step="0.01" value={depth} onChange={(event) => setDepth(event.target.value)} /></label>
              <label className="commercial-map-setting-row"><span><strong>Medida validada</strong><small>Somente com documento oficial</small></span><Switch checked={areaValidated} onCheckedChange={setAreaValidated} disabled={!officialArea} /></label>

              <h3>Precificação</h3>
              <label><Label>Modelo</Label><select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as PricingMode)}><option value="NEGOTIABLE">A negociar</option><option value="FIXED_TOTAL">Valor total fixo</option><option value="PRICE_PER_SQUARE_METER">Preço por m²</option><option value="NOT_FOR_SALE">Fora de venda</option></select></label>
              {pricingMode === 'FIXED_TOTAL' && <label><Label>Valor total</Label><Input type="number" min="0" step="0.01" value={fixedTotal} onChange={(event) => setFixedTotal(event.target.value)} /></label>}
              {pricingMode === 'PRICE_PER_SQUARE_METER' && <label><Label>Preço por m²</Label><Input type="number" min="0" step="0.01" value={pricePerSqm} onChange={(event) => setPricePerSqm(event.target.value)} /></label>}
              <label><Label>Preço mínimo</Label><Input type="number" min="0" step="0.01" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} /></label>
              {(pricing.warning || minimumInvalid) && <p className="commercial-map-form-warning is-full"><AlertCircle />{pricing.warning || 'O preço mínimo não pode superar o valor solicitado.'}</p>}

              <h3>Infraestrutura e características</h3>
              <label className="is-full"><Label>Infraestrutura (separada por vírgulas)</Label><Input value={infrastructure} onChange={(event) => setInfrastructure(event.target.value)} placeholder="Ex.: 220 V, esgoto, carga e descarga" /></label>
              {[
                ['Energia elétrica', hasElectricity, setHasElectricity], ['Água', hasWater, setHasWater], ['Internet', hasInternet, setHasInternet],
                ['Lote de esquina', isCorner, setIsCorner], ['Área coberta', isCovered, setIsCovered],
              ].map(([label, checked, setter]) => <label className="commercial-map-setting-row" key={String(label)}><span><strong>{String(label)}</strong></span><Switch checked={checked as boolean} onCheckedChange={setter as (value: boolean) => void} /></label>)}
              <label className="is-full"><Label>Acessibilidade</Label><Textarea value={accessibilityNotes} onChange={(event) => setAccessibilityNotes(event.target.value)} rows={2} /></label>
              <label className="is-full"><Label>Notas comerciais</Label><Textarea value={commercialNotes} onChange={(event) => setCommercialNotes(event.target.value)} rows={2} /></label>
              <label className="is-full"><Label>Notas internas</Label><Textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} rows={2} /></label>

              <h3>Auditoria</h3>
              <label className="is-full"><Label>Motivo / documento de origem *</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} /></label>
              <div className="commercial-map-structure-guard is-full"><ShieldCheck /><span><strong>Alteração rastreável</strong>A versão anterior, o novo cadastro e o responsável ficam registrados. O status comercial não muda silenciosamente ao editar o preço.</span></div>
            </div>
          </ScrollArea>
          <DialogFooter className="border-t bg-muted/25 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={lotUpdate.isPending}>Cancelar</Button>
            <Button type="submit" disabled={!ready || lotUpdate.isPending}>{lotUpdate.isPending ? <Loader2 className="animate-spin" /> : <Save />}Salvar alterações</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
