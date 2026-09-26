import { useState } from 'react';
import { AlertCircle, BookUser, Check, Loader2, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SalesBuyerDraft } from '../salesTypes';
import { formatDocument, formatPhoneBr, isValidDocument, isValidEmail, isValidPhoneBr } from '../salesValidation';
import type { AutosaveStatus } from '../useExhibitorAutosave';
import type { CommercialExhibitor } from '../exhibitorService';
import { ExhibitorBookDialog } from './ExhibitorBookDialog';
import { prepareSaleLogo } from '../saleLogo';

interface Props {
  value: SalesBuyerDraft;
  onChange: (value: SalesBuyerDraft) => void;
  showErrors: boolean;
  logoPreview: string | null;
  onLogoChange: (image: Blob | null, preview: string | null) => void;
  saveStatus?: AutosaveStatus;
  onRetrySave?: () => void;
}

export function buyerErrors(value: SalesBuyerDraft) {
  return {
    buyerName: value.buyerName.trim().length < 3 ? 'Informe o nome ou razão social.' : null,
    documentNumber: isValidDocument(value.documentNumber) ? null : 'CPF ou CNPJ inválido.',
    phone: isValidPhoneBr(value.phone) ? null : 'Informe um celular com DDD.',
    email: isValidEmail(value.email) ? null : 'E-mail inválido.',
  };
}

function SaveIndicator({ status, onRetry }: { status: AutosaveStatus; onRetry?: () => void }) {
  if (status === 'saving') return <span className="sales-autosave"><Loader2 className="h-3 w-3 animate-spin" />Salvando</span>;
  if (status === 'saved') return <span className="sales-autosave is-saved"><Check className="h-3 w-3" />Salvo</span>;
  if (status === 'error') {
    return (
      <button type="button" className="sales-autosave is-error" onClick={onRetry}>
        <AlertCircle className="h-3 w-3" />Não salvo · tentar de novo
      </button>
    );
  }
  return null;
}

export function SalesBuyerForm({ value, onChange, showErrors, saveStatus = 'idle', onRetrySave, logoPreview, onLogoChange }: Props) {
  const errors = buyerErrors(value);
  const [bookOpen, setBookOpen] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const chooseLogo = async (file?: File) => {
    if (!file) return;
    setProcessing(true); setLogoError(null);
    try {
      const image = await prepareSaleLogo(file);
      onLogoChange(image, URL.createObjectURL(image));
    } catch (error) { setLogoError(error instanceof Error ? error.message : 'Imagem inválida.'); }
    finally { setProcessing(false); }
  };
  const set = (patch: Partial<SalesBuyerDraft>) => onChange({ ...value, ...patch });
  const pick = (item: CommercialExhibitor) => set({
    buyerName: item.name.toUpperCase(),
    documentNumber: formatDocument(item.documentNumber),
    phone: item.phone ? formatPhoneBr(item.phone) : '',
    email: item.email ?? '',
  });

  return (
    <div className="sales-sheet-body">
      <div className="sales-section-head">
        <strong>Dados do expositor</strong>
        <div className="sales-section-head__tools">
          <SaveIndicator status={saveStatus} onRetry={onRetrySave} />
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setBookOpen(true)} aria-label="Expositores cadastrados">
            <BookUser className="h-4 w-4" />
            <span className="sales-hide-xs">Expositores cadastrados</span>
          </Button>
        </div>
      </div>

      <div className="sales-field">
        <label htmlFor="sales-buyer-name">Nome / Razão social</label>
        <Input
          id="sales-buyer-name"
          value={value.buyerName}
          onChange={(event) => set({ buyerName: event.target.value.toUpperCase() })}
          placeholder="EXPOSITOR OU EMPRESA"
          autoComplete="off"
        />
        {showErrors && errors.buyerName && <span className="sales-field__error">{errors.buyerName}</span>}
      </div>

      <div className="sales-grid">
        <div className="sales-field">
          <label htmlFor="sales-buyer-doc">CPF ou CNPJ</label>
          <Input
            id="sales-buyer-doc"
            value={value.documentNumber}
            onChange={(event) => set({ documentNumber: formatDocument(event.target.value) })}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
          {showErrors && errors.documentNumber && <span className="sales-field__error">{errors.documentNumber}</span>}
        </div>
        <div className="sales-field">
          <label htmlFor="sales-buyer-phone">Celular</label>
          <Input
            id="sales-buyer-phone"
            value={value.phone}
            onChange={(event) => set({ phone: formatPhoneBr(event.target.value) })}
            inputMode="tel"
            placeholder="(55) 99999-9999"
          />
          {showErrors && errors.phone && <span className="sales-field__error">{errors.phone}</span>}
        </div>
      </div>

      <div className="sales-field">
        <label htmlFor="sales-buyer-email">E-mail (opcional)</label>
        <Input
          id="sales-buyer-email"
          value={value.email}
          onChange={(event) => set({ email: event.target.value })}
          inputMode="email"
          placeholder="contato@empresa.com.br"
        />
        {showErrors && errors.email && <span className="sales-field__error">{errors.email}</span>}
      </div>

      <div className="sales-field">
        <label htmlFor="sales-buyer-notes">Observações da venda (opcional)</label>
        <Textarea
          id="sales-buyer-notes"
          rows={2}
          value={value.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </div>

      <div className="sales-field sales-logo-field">
        <label htmlFor="sales-buyer-logo">Imagem da venda (opcional)</label>
        <div className="sales-logo-field__row">
          {logoPreview && <img src={logoPreview} alt="Prévia da imagem da venda" />}
          <label className="sales-logo-field__pick" htmlFor="sales-buyer-logo"><ImagePlus className="h-4 w-4" />{processing ? 'Preparando…' : logoPreview ? 'Trocar imagem' : 'Adicionar imagem'}</label>
          <input id="sales-buyer-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={processing} onChange={(event) => { void chooseLogo(event.target.files?.[0]); event.target.value = ''; }} />
          {logoPreview && <Button type="button" variant="ghost" size="icon" aria-label="Remover imagem" onClick={() => onLogoChange(null, null)}><X className="h-4 w-4" /></Button>}
        </div>
        <span className="sales-logo-field__note">A imagem é centralizada em fundo limpo e aparece nos lotes desta venda, inclusive nos links de consulta autorizados. Use apenas imagens cuja divulgação foi autorizada.</span>
        {logoError && <span role="alert" className="sales-field__error">{logoError}</span>}
      </div>

      <ExhibitorBookDialog open={bookOpen} onOpenChange={setBookOpen} onSelect={pick} />
    </div>
  );
}
