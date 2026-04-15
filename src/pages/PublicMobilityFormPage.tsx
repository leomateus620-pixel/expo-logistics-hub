import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Status = 'loading' | 'valid' | 'invalid' | 'inactive';

interface LinkData {
  committee_name: string;
  president_name: string;
}

export default function PublicMobilityFormPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<LinkData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const resolve = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/resolve-public-link`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          }
        );

        if (res.status === 404) {
          setErrorMsg('Link não encontrado ou inválido.');
          setStatus('invalid');
          return;
        }

        if (res.status === 403) {
          setErrorMsg('Este link foi desativado.');
          setStatus('inactive');
          return;
        }

        if (!res.ok) {
          setErrorMsg('Erro ao validar o link.');
          setStatus('invalid');
          return;
        }

        const json = await res.json();
        setData(json);
        setStatus('valid');
      } catch {
        setErrorMsg('Erro de conexão.');
        setStatus('invalid');
      }
    };

    resolve();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent to-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
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

        {/* Valid */}
        {status === 'valid' && data && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg">{data.committee_name}</CardTitle>
              <p className="text-sm text-muted-foreground">Presidente: {data.president_name}</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="w-10 h-10 text-primary" />
              <p className="font-medium text-primary">Link válido!</p>
              <p className="text-sm text-muted-foreground text-center">
                O formulário de autorização de mobilidade será disponibilizado em breve nesta página.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Este é um formulário restrito. Não compartilhe este link.
        </p>
      </div>
    </div>
  );
}
