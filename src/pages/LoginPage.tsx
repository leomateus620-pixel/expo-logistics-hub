import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import logo from '@/assets/logofeira26.webp';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError('Email ou senha incorretos');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Fenasoja" className="w-16 h-16 rounded-xl object-contain bg-sidebar p-1.5" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Fenasoja Logística</h1>
            <p className="text-sm text-muted-foreground mt-1">Entre com suas credenciais</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11"
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11"
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="submit" className="w-full h-11" disabled={loading}>
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        <p className="text-xs text-center text-muted-foreground">
          Acesso restrito. Solicite suas credenciais ao administrador.
        </p>
      </div>
    </div>
  );
}
