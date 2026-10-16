import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

/** Admin area access also accepts gestores elsewhere; this design route is strictly org-admin. */
export default function WorkersAdminGuard({ children }: { children: ReactNode }) {
  const { myRole, isLoading } = useCurrentOrg();
  if (isLoading) return <div role="status" className="p-8">Verificando acesso…</div>;
  if (myRole !== 'admin') return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">Revisão disponível para administradores</h1><p style={{ margin: '16px 0' }}>Você pode conhecer a equipe e conversar com os bots usando suas permissões.</p><Link to="/equipe-ia/conheca" className="underline">Conheça a equipe Fenasoja</Link></main>;
  return <>{children}</>;
}
