import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Settings, Users, Shield } from 'lucide-react';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operador: 'Operador',
  leitura: 'Somente Leitura',
};

export default function SettingsPage() {
  const { orgName, myRole } = useCurrentOrg();
  const { members } = useOrgMembers();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerenciar organização e permissões</p>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" /> Organização
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nome</span>
            <span className="font-medium">{orgName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Seu papel</span>
            <Badge variant="outline">{roleLabels[myRole || ''] || myRole}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-mail</span>
            <span className="text-xs">{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" /> Membros ({members.length})
        </h2>
        <div className="space-y-2">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium">{m.nome_exibicao || 'Sem nome'}</p>
                <p className="text-xs text-muted-foreground">{m.cargo || 'Sem cargo'}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{roleLabels[m.role] || m.role}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
