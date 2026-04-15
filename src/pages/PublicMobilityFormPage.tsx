import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Plus, Trash2, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

type Status = 'loading' | 'valid' | 'invalid' | 'inactive' | 'submitting' | 'success';

interface MemberEntry {
  member_name: string;
  member_role: string;
  member_identifier: string;
  access_electric_car: boolean;
  access_scooter: boolean;
  qr_access_free: boolean;
  notes: string;
}

const emptyMember = (): MemberEntry => ({
  member_name: '',
  member_role: '',
  member_identifier: '',
  access_electric_car: false,
  access_scooter: false,
  qr_access_free: false,
  notes: '',
});

interface LinkData {
  committee_name: string;
  president_name: string;
  has_existing_submission: boolean;
  existing_form: any;
  existing_members: MemberEntry[];
}

export default function PublicMobilityFormPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<LinkData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [opName, setOpName] = useState('');
  const [opPhone, setOpPhone] = useState('');
  const [opEmail, setOpEmail] = useState('');
  const [needsElectric, setNeedsElectric] = useState(false);
  const [needsScooter, setNeedsScooter] = useState(false);
  const [members, setMembers] = useState<MemberEntry[]>([emptyMember()]);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const baseUrl = `https://${projectId}.supabase.co/functions/v1`;

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    (async () => {
      try {
        const res = await fetch(`${baseUrl}/resolve-public-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.status === 404) { setErrorMsg('Link não encontrado ou inválido.'); setStatus('invalid'); return; }
        if (res.status === 403) { setErrorMsg('Este link foi desativado.'); setStatus('inactive'); return; }
        if (!res.ok) { setErrorMsg('Erro ao validar o link.'); setStatus('invalid'); return; }

        const json = await res.json();
        setData(json);

        // Pre-fill with existing data if available
        if (json.has_existing_submission && json.existing_form) {
          const f = json.existing_form;
          setOpName(f.operational_responsible_name || '');
          setOpPhone(f.operational_responsible_phone || '');
          setOpEmail(f.operational_responsible_email || '');
          setNeedsElectric(f.needs_electric_car || false);
          setNeedsScooter(f.needs_scooter || false);
          if (json.existing_members?.length > 0) {
            setMembers(json.existing_members.map((m: any) => ({
              member_name: m.member_name || '',
              member_role: m.member_role || '',
              member_identifier: m.member_identifier || '',
              access_electric_car: m.access_electric_car || false,
              access_scooter: m.access_scooter || false,
              qr_access_free: m.qr_access_free || false,
              notes: m.notes || '',
            })));
          }
        }
        setStatus('valid');
      } catch {
        setErrorMsg('Erro de conexão.');
        setStatus('invalid');
      }
    })();
  }, [token, baseUrl]);

  const updateMember = useCallback((index: number, field: keyof MemberEntry, value: any) => {
    setMembers(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  }, []);

  const addMember = () => setMembers(prev => [...prev, emptyMember()]);
  const removeMember = (index: number) => setMembers(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!needsElectric && !needsScooter) {
      toast.error('Selecione ao menos um modal (carro elétrico ou patinete).');
      return;
    }

    const validMembers = members.filter(m => m.member_name.trim());
    if (validMembers.length === 0) {
      toast.error('Adicione ao menos um integrante com nome.');
      return;
    }

    for (const m of validMembers) {
      if (!m.access_electric_car && !m.access_scooter) {
        toast.error(`Integrante "${m.member_name}" precisa ter ao menos um modal selecionado.`);
        return;
      }
    }

    setStatus('submitting');

    try {
      const res = await fetch(`${baseUrl}/submit-public-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          operational_responsible_name: opName || null,
          operational_responsible_phone: opPhone || null,
          operational_responsible_email: opEmail || null,
          needs_electric_car: needsElectric,
          needs_scooter: needsScooter,
          members: validMembers,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Erro ao enviar.');
        setStatus('valid');
        return;
      }

      setStatus('success');
    } catch {
      toast.error('Erro de conexão ao enviar.');
      setStatus('valid');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent to-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <ShieldCheck className="w-6 h-6" />
            <span className="font-bold text-lg">Fenasoja 2026</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">Autorização de Mobilidade</h1>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Validando link...</p>
            </CardContent>
          </Card>
        )}

        {/* Invalid / Inactive */}
        {(status === 'invalid' || status === 'inactive') && (
          <Card className="border-destructive/30">
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-destructive" />
              <p className="font-medium text-destructive">{errorMsg}</p>
              <p className="text-sm text-muted-foreground text-center">
                Entre em contato com a coordenação da Fenasoja para obter um link válido.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Success */}
        {status === 'success' && (
          <Card className="border-primary/30">
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <CheckCircle2 className="w-12 h-12 text-primary" />
              <p className="font-semibold text-lg text-primary">Autorização enviada com sucesso!</p>
              <p className="text-sm text-muted-foreground text-center">
                Sua solicitação será analisada pela coordenação. Os integrantes receberão acesso conforme aprovação.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        {(status === 'valid' || status === 'submitting') && data && (
          <div className="space-y-4">
            {/* Committee Info */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{data.committee_name}</CardTitle>
                <p className="text-sm text-muted-foreground">Presidente: {data.president_name}</p>
              </CardHeader>
            </Card>

            {data.has_existing_submission && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
                ⚠️ Já existe uma submissão para esta comissão. Enviar novamente irá atualizar os dados anteriores.
              </div>
            )}

            {/* Operational Contact */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Responsável Operacional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Nome</Label>
                  <Input value={opName} onChange={e => setOpName(e.target.value)} placeholder="Nome do responsável" className="h-11" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input value={opPhone} onChange={e => setOpPhone(e.target.value)} placeholder="(00) 00000-0000" className="h-11" />
                  </div>
                  <div>
                    <Label className="text-xs">E-mail</Label>
                    <Input type="email" value={opEmail} onChange={e => setOpEmail(e.target.value)} placeholder="email@exemplo.com" className="h-11" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modals */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Modais de Mobilidade</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={needsElectric} onCheckedChange={(v) => setNeedsElectric(!!v)} />
                  <span className="text-sm">Carro Elétrico</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={needsScooter} onCheckedChange={(v) => setNeedsScooter(!!v)} />
                  <span className="text-sm">Patinete</span>
                </label>
              </CardContent>
            </Card>

            {/* Members */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Integrantes Autorizados</CardTitle>
                <Button size="sm" variant="outline" onClick={addMember} className="h-8 gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {members.map((m, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-3 relative">
                    {members.length > 1 && (
                      <button
                        onClick={() => removeMember(i)}
                        className="absolute top-2 right-2 p-1 text-destructive/60 hover:text-destructive transition-colors"
                        aria-label="Remover integrante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <div>
                      <Label className="text-xs">Nome *</Label>
                      <Input value={m.member_name} onChange={e => updateMember(i, 'member_name', e.target.value)} placeholder="Nome completo" className="h-11" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Cargo</Label>
                        <Input value={m.member_role} onChange={e => updateMember(i, 'member_role', e.target.value)} placeholder="Ex: Coordenador" className="h-11" />
                      </div>
                      <div>
                        <Label className="text-xs">Identificador (CPF/Matrícula)</Label>
                        <Input value={m.member_identifier} onChange={e => updateMember(i, 'member_identifier', e.target.value)} placeholder="Opcional" className="h-11" />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={m.access_electric_car} onCheckedChange={(v) => updateMember(i, 'access_electric_car', !!v)} />
                        <span className="text-xs">Carro Elétrico</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={m.access_scooter} onCheckedChange={(v) => updateMember(i, 'access_scooter', !!v)} />
                        <span className="text-xs">Patinete</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={m.qr_access_free} onCheckedChange={(v) => updateMember(i, 'qr_access_free', !!v)} />
                        <span className="text-xs">QR Gratuito</span>
                      </label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button onClick={handleSubmit} disabled={status === 'submitting'} className="w-full h-12 gap-2 text-base">
              {status === 'submitting' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {data.has_existing_submission ? 'Atualizar Autorização' : 'Enviar Autorização'}
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Este é um formulário restrito. Não compartilhe este link.
        </p>
      </div>
    </div>
  );
}
