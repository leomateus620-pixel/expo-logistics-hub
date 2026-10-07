import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const ORG_KEY = 'fenasoja_org_id';
/** Vínculos restaurados do cache persistido (antes desta carga da página) não contam como verificados. */
const PAGE_SESSION_STARTED_AT = Date.now();

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
    dataUpdatedAt,
    refetch,
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
    // Cache restaurado de outra carga da página não libera acesso: confirma no servidor.
    refetchOnMount: (query) => (query.state.dataUpdatedAt < PAGE_SESSION_STARTED_AT ? 'always' : true),
    // Falhas de rede/servidor ocupado: até 6 novas tentativas (~30 s) antes de mostrar erro.
    retry: (failureCount, error: any) => {
      const code = String(error?.code ?? '');
      if (code === '42501' || code === 'PGRST301' || /JWT/i.test(String(error?.message ?? ''))) return failureCount < 1;
      return failureCount < 6;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000) * (0.8 + Math.random() * 0.4),
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

  // Estados separados: carregando, erro de verificação e ausência de acesso.
  // Um vínculo é liberado quando confirmado pelo servidor nesta carga da página.
  // Se a verificação falhar por instabilidade e já houver vínculo deste mesmo
  // usuário em cache (a chave inclui o user id), a tela segue utilizável: o
  // servidor continua conferindo a permissão em cada leitura (RLS), então o
  // cache nunca amplia acesso a dados. Sem cache, a falha mostra o erro.
  const confirmedThisPage = dataUpdatedAt >= PAGE_SESSION_STARTED_AT;
  const cachedFallback = !!user && isError && !confirmedThisPage && !!membership;
  const verificationError = !!user && isError && !confirmedThisPage && !membership;
  // Com vínculo deste usuário em cache, a tela abre enquanto o servidor confirma em segundo plano.
  const isResolving = authLoading || (!!user && !confirmedThisPage && !isError && !membership);
  const hasVerifiedOrg = !!membership && (confirmedThisPage || cachedFallback || (!!user && !confirmedThisPage && !isError));

  return {
    orgId,
    orgName,
    myRole,
    membership,
    isLoading: isResolving,
    isError,
    verificationError,
    retryVerification: () => refetch(),
    hasOrg: hasVerifiedOrg,
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
  };
}
