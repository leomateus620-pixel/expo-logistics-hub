import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const ORG_KEY = 'fenasoja_org_id';

function readOrgKey(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

function writeOrgKey(value: string) {
  try {
    localStorage.setItem(ORG_KEY, value);
  } catch {
    /* Safari private mode pode bloquear o storage */
  }
}

function clearOrgKey() {
  try {
    localStorage.removeItem(ORG_KEY);
  } catch {
    /* noop */
  }
}

export function useCurrentOrg() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: membership,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['my-org-membership', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('org_members')
        .select('id, org_id, role, nome_exibicao, cargo, organizations(id, nome)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Falha de rede/serviço: propaga o erro para o react-query tentar de novo.
      // Nunca tratar como "usuário sem organização".
      if (error) throw error;

      if (!data || data.length === 0) {
        // Confirmado com sucesso que não há vínculo: só aqui limpamos o cache local.
        clearOrgKey();
        return null;
      }

      const savedOrgId = readOrgKey();
      const preferred = savedOrgId ? data.find((m: any) => m.org_id === savedOrgId) : null;
      const selected = preferred || data[0];
      writeOrgKey(selected.org_id);
      return selected;
    },
    enabled: !!user,
    staleTime: 60000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  const createOrgMutation = useMutation({
    mutationFn: async (nome: string) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await (supabase as any).rpc('create_org_with_member', { org_nome: nome });
      if (error) throw error;
      writeOrgKey(data);
      return { id: data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-org-membership'] });
    },
  });

  const orgId = membership?.org_id || null;
  const orgName = (membership?.organizations as any)?.nome || '';
  const myRole = membership?.role || null;

  // A chave inclui user.id: uma revalidação com vínculo já confirmado pertence
  // à mesma sessão e não deve desmontar a rota protegida. A hidratação inicial,
  // a ausência de vínculo e os erros continuam indeterminados/fail-closed.
  const isResolving = authLoading
    || (!!user && (isLoading || (isFetching && !membership)))
    || isError;

  return {
    orgId,
    orgName,
    myRole,
    membership,
    isLoading: isResolving,
    isError,
    hasOrg: !!membership,
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
  };
}
