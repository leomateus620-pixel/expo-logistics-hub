import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useVehicles } from '@/hooks/useVehicles';
import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Upload, Loader2, Camera, QrCode, Truck, Car, User, CreditCard, FileText } from 'lucide-react';
import { toast } from 'sonner';
import QrScannerDialog from './QrScannerDialog';
import type { NfceQrData } from '@/lib/parseNfceQr';

interface ExpenseFormProps {
  onSubmit: (data: Record<string, any>, file?: File) => Promise<void>;
  isSubmitting?: boolean;
  initialData?: Record<string, any>;
}

const paymentMethods = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'pix', label: 'Pix' },
  { value: 'outro', label: 'Outro' },
];

const pixKeyTypes = [
  { value: 'cpf', label: 'CPF' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'aleatoria', label: 'Chave Aleatória' },
];

export default function ExpenseForm({ onSubmit, isSubmitting, initialData }: ExpenseFormProps) {
  const { categories } = useExpenseCategories();
  const { vehicles } = useVehicles();
  const { transports } = useTransports();
  const { members } = useOrgMembers();

  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    amount: initialData?.amount || '',
    expense_date: initialData?.expense_date
      ? new Date(initialData.expense_date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    category_id: initialData?.category_id || '',
    payment_method: initialData?.payment_method || 'dinheiro',
    transport_id: initialData?.transport_id || '',
    vehicle_id: initialData?.vehicle_id || '',
    member_user_id: initialData?.member_user_id || '',
    paid_by_name: initialData?.paid_by_name || '',
    paid_by_user_id: initialData?.paid_by_user_id || '',
    pix_key: initialData?.pix_key || '',
    pix_key_type: initialData?.pix_key_type || '',
    origem_lancamento: initialData?.origem_lancamento || 'manual',
  });

  const [file, setFile] = useState<File | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrFields, setQrFields] = useState<Set<string>>(new Set());

  const selectedCategory = categories.find((c: any) => c.id === form.category_id);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // Remove QR badge if user manually edits a QR-filled field
    setQrFields(prev => { const n = new Set(prev); n.delete(field); return n; });
  };

  // Smart auto-fill: transport → vehicle + driver
  const handleTransportSelect = useCallback((transportId: string) => {
    const transport = transports.find((t: any) => t.id === transportId);
    const updates: Record<string, string> = { transport_id: transportId };
    if (transport?.vehicle_id) updates.vehicle_id = transport.vehicle_id;
    if (transport?.motorista_user_id) {
      updates.member_user_id = transport.motorista_user_id;
      const member = members.find((m: any) => m.user_id === transport.motorista_user_id);
      if (member) {
        updates.paid_by_user_id = transport.motorista_user_id;
        updates.paid_by_name = member.nome_exibicao || '';
      }
    }
    setForm(prev => ({ ...prev, ...updates }));
  }, [transports, members]);

  const handleMemberSelect = (userId: string) => {
    const member = members.find((m: any) => m.user_id === userId);
    setForm(prev => ({
      ...prev,
      paid_by_user_id: userId,
      paid_by_name: member?.nome_exibicao || '',
      member_user_id: userId,
    }));
  };

  // QR scan result handler
  const handleQrResult = (data: NfceQrData) => {
    const updates: Record<string, string> = { origem_lancamento: 'qr_scan' };
    const filled = new Set<string>();

    if (data.amount) { updates.amount = String(data.amount); filled.add('amount'); }
    if (data.issuerCnpj) {
      updates.description = `CNPJ: ${data.issuerCnpj}${data.accessKey ? ` • Chave: ${data.accessKey.slice(0, 12)}...` : ''}`;
      filled.add('description');
    }
    if (data.invoiceNumber) {
      updates.title = `Nota Nº ${data.invoiceNumber}`;
      filled.add('title');
    }

    setForm(prev => ({ ...prev, ...updates }));
    setQrFields(filled);
    toast.success('Dados do QR aplicados ao formulário');
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error('Informe o título da despesa');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Informe um valor válido');
    if (!form.category_id) return toast.error('Selecione a categoria');

    const payload: Record<string, any> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      amount: Number(form.amount),
      expense_date: new Date(form.expense_date).toISOString(),
      category_id: form.category_id,
      payment_method: form.payment_method,
      paid_by_name: form.paid_by_name || null,
      paid_by_user_id: form.paid_by_user_id || null,
      member_user_id: form.member_user_id || null,
      transport_id: form.transport_id || null,
      vehicle_id: form.vehicle_id || null,
      pix_key: form.pix_key || null,
      pix_key_type: form.pix_key_type || null,
      origem_lancamento: form.origem_lancamento,
      status: file ? 'pendente_validacao' : 'pendente_comprovante',
    };

    await onSubmit(payload, file || undefined);
  };

  const QrBadge = ({ field }: { field: string }) => {
    if (!qrFields.has(field)) return null;
    return <Badge variant="outline" className="text-[8px] px-1.5 py-0 gap-0.5 ml-1 text-primary border-primary/30"><QrCode className="w-2.5 h-2.5" />QR</Badge>;
  };

  const SectionTitle = ({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 pt-3 pb-1.5 border-t border-border/30 first:border-0 first:pt-0">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs font-bold text-foreground uppercase tracking-wider">{children}</span>
    </div>
  );

  // Get transport display label
  const getTransportLabel = (t: any) => {
    const route = `${(t.origem || '').slice(0, 15)} → ${(t.destino || '').slice(0, 15)}`;
    return t.titulo || route;
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto px-1">
      {/* QR Scan Button */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setQrOpen(true)}
        className="w-full gap-2 h-11 rounded-xl border-primary/30 text-primary hover:bg-primary/5"
      >
        <Camera className="w-4 h-4" /> Escanear Nota Fiscal (QR Code)
      </Button>

      {/* Section: Info */}
      <SectionTitle icon={FileText}>Informações</SectionTitle>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold flex items-center">Título *<QrBadge field="title" /></Label>
        <Input value={form.title} onChange={e => handleChange('title', e.target.value)} placeholder="Ex: Almoço equipe" className="h-11 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Categoria *</Label>
          <Select value={form.category_id} onValueChange={v => handleChange('category_id', v)}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {categories.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold flex items-center">Valor (R$) *<QrBadge field="amount" /></Label>
          <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => handleChange('amount', e.target.value)} placeholder="0,00" className="h-11 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Data/Hora</Label>
          <Input type="datetime-local" value={form.expense_date} onChange={e => handleChange('expense_date', e.target.value)} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Pagamento</Label>
          <Select value={form.payment_method} onValueChange={v => handleChange('payment_method', v)}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {paymentMethods.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold flex items-center">Descrição<QrBadge field="description" /></Label>
        <Textarea value={form.description} onChange={e => handleChange('description', e.target.value)} placeholder="Detalhes..." rows={2} className="rounded-xl" />
      </div>

      {/* Section: Operational Context */}
      <SectionTitle icon={Truck}>Contexto Operacional</SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold flex items-center gap-1"><Truck className="w-3 h-3" />Transporte</Label>
          <Select value={form.transport_id} onValueChange={handleTransportSelect}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              {transports.filter((t: any) => t.status !== 'cancelado').slice(0, 30).map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{getTransportLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold flex items-center gap-1"><Car className="w-3 h-3" />Veículo</Label>
          <Select value={form.vehicle_id} onValueChange={v => handleChange('vehicle_id', v)}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo || v.marca || ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section: Who paid */}
      <SectionTitle icon={CreditCard}>Pagamento</SectionTitle>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold flex items-center gap-1"><User className="w-3 h-3" />Quem pagou</Label>
        <Select value={form.paid_by_user_id} onValueChange={handleMemberSelect}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione o membro" /></SelectTrigger>
          <SelectContent>
            {members.filter((m: any) => m.is_active).map((m: any) => (
              <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao || 'Membro'}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.paid_by_user_id && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Tipo Pix</Label>
            <Select value={form.pix_key_type} onValueChange={v => handleChange('pix_key_type', v)}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                {pixKeyTypes.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Chave Pix</Label>
            <Input value={form.pix_key} onChange={e => handleChange('pix_key', e.target.value)} placeholder="Chave para ressarcimento" className="h-11 rounded-xl" />
          </div>
        </div>
      )}

      {/* Section: Attachment */}
      <SectionTitle icon={Upload}>Comprovante</SectionTitle>

      <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
        <Upload className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {file ? file.name : 'Toque para anexar foto ou PDF'}
        </span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
      </label>

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full h-11 rounded-xl" size="lg">
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Salvar Despesa
      </Button>

      {/* QR Scanner */}
      <QrScannerDialog open={qrOpen} onOpenChange={setQrOpen} onResult={handleQrResult} />
    </div>
  );
}
