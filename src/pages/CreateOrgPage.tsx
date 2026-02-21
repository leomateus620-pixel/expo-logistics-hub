import { useState } from 'react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/logofeira26.webp';

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={logo} alt="Fenasoja" className="w-16 h-16 mx-auto rounded-xl object-contain bg-primary/10 p-1" />
          <h1 className="text-xl font-bold mt-4">Bem-vindo ao Fenasoja Logística</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Crie sua organização para começar a gerenciar a logística do evento.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
