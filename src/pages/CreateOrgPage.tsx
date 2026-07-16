import { useState } from 'react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

export default function CreateOrgPage() {
  const { createOrg, isCreating } = useCurrentOrg();
  const [nome, setNome] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await createOrg(nome.trim());
      toast.success('Organização criada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar organização');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <div className="text-center">
          <FenasojaBrand subtitle="Logística" tone="light" className="justify-center" />
          <h1 className="mt-6 text-xl font-bold">Bem-vindo à Fenasoja 2028</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Crie sua organização para começar a gerenciar a logística do evento.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            placeholder="Nome da organização"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-12"
            autoFocus
          />
          <Button type="submit" className="w-full h-12" disabled={isCreating || !nome.trim()}>
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar Organização
          </Button>
        </form>
      </div>
    </div>
  );
}
