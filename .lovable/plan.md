## Diagnóstico — Tela branca e carregamento infinito em /mobility-auth

Após inspeção dos hooks (`useMobilityForms`, `useMobilityMembers`, `useOfficialCommittees`, `useCapabilities`), do `MobilityAdminPanel`, do `MobilityAuthPage`, do `CapabilityGuard` e da arquitetura de auth (`AuthProvider`, `OrgGuard`), encontrei **5 causas combinadas** que produzem o sintoma:

### 🔴 Causa 1 (principal) — Erro silencioso vira loading infinito
Em `MobilityAdminPanel.tsx` linha 154, o painel só verifica `allMembersLoading`:
```tsx
{allMembersLoading ? (
  <p>Carregando...</p>
) : filtered.length === 0 ? (
  <p>Nenhum integrante encontrado</p>
) : (...)}
```
**`isError` é totalmente ignorado.** Se a query `mobility-members-all` falhar (rede instável, timeout do Supabase, falha temporária no JOIN com `committee_mobility_forms`), o `isLoading` vira `false` mas `data` fica `undefined` → o hook retorna `[]` por causa do `allMembers.data || []`, e o usuário vê **"Nenhum integrante encontrado"** sem mensagem de erro — ou pior, em redes lentas onde a query ainda está em backoff/retry, fica em "Carregando..." permanente.

O mesmo vale para `useMobilityForms` (não expõe `isError`) e para `useOfficialCommittees` (expõe `isError` mas o `MobilityAdminPanel` não usa).

### 🟡 Causa 2 — Race condition Auth ↔ Query (padrão do Lovable Stack Overflow)
`useMobilityForms`/`useMobilityMembers`/`useOfficialCommittees` têm `enabled: !!orgId`. O `orgId` vem de `useCurrentOrg`, que **só popula depois** do `useAuth` resolver a sessão. Mas as queries do React Query estão **persistidas no localStorage** (`PersistQueryClientProvider`). Em recargas de página, o cache antigo aparece momentaneamente; se o `auth.uid()` ainda não foi restaurado do storage quando a refetch dispara, RLS retorna **0 linhas como sucesso**, congelando a UI no estado "Nenhum integrante" mesmo havendo dados. Para o usuário restrito (`leitura` + `mobility_access`), isso é mais frequente porque ele cai direto em `/mobility-auth` sem passar pelo Dashboard antes.

### 🟠 Causa 3 — Dupla query desperdiçada em `useMobilityMembers`
O hook **sempre** dispara duas queries: `members` (filtrada por `formId`) e `allMembers` (com JOIN). O `MobilityAdminPanel` só usa `allMembers`, mas paga o custo da `members` também rodar — duplica latência inicial e chance de falha.

### 🟡 Causa 4 — ErrorBoundary não captura erros do React Query
`MobilityAuthPage` envolve `MobilityAdminPanel` em `<ErrorBoundary>`, mas erros async de `useQuery` **não** propagam para boundaries (precisariam de `throwOnError: true`). Resultado: erros ficam invisíveis.

### 🟢 Causa 5 — Falta de safety guards
- `EditMemberDialog` faz `committees.map` sem checar se `committees` é array.
- `MobilityForm` já usa `safeCommittees` defensivo, mas `MobilityAdminPanel` não.

---

## Plano de correção

### Mudança 1 — `src/hooks/useMobilityMembers.ts`
- Expor `isError`, `error` e `refetch` para `allMembers`.
- Tornar a query `members` **sob demanda**: só dispara se `formId` foi passado (`enabled: !!orgId && !!formId`). Hoje sempre roda.
- Adicionar `staleTime: 30_000` e `retry: 2` (atualmente usa default infinito de retry, que pode prender em "Carregando" muito tempo se backend está degradado).

### Mudança 2 — `src/hooks/useMobilityForms.ts`
- Expor `isError`, `error`, `refetch`.
- Adicionar `staleTime: 30_000` e `retry: 2`.

### Mudança 3 — `src/hooks/useOfficialCommittees.ts`
- Adicionar `staleTime: 60_000` e `retry: 2` (já expõe `isError`).

### Mudança 4 — `src/components/mobility/MobilityAdminPanel.tsx`
Adicionar tratamento explícito de erro + botão de retry:
```tsx
const { forms, isError: formsError, refetch: refetchForms } = useMobilityForms();
const { allMembers, allMembersLoading, isError: membersError, refetch: refetchMembers, ... } = useMobilityMembers();

// Antes da renderização da tabela:
if (formsError || membersError) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Não foi possível carregar os dados de mobilidade</AlertTitle>
      <AlertDescription>
        Verifique sua conexão e tente novamente.
        <Button size="sm" onClick={() => { refetchForms(); refetchMembers(); }}>Tentar novamente</Button>
      </AlertDescription>
    </Alert>
  );
}
```
Também garantir `Array.isArray(committees)` antes do `.map`.

### Mudança 5 — `src/components/mobility/EditMemberDialog.tsx`
- Wrap `committees` com `Array.isArray(committees) ? committees : []` antes do `.map`.

### Mudança 6 — `src/pages/MobilityAuthPage.tsx`
- Adicionar gate de auth/org: enquanto `useAuth().loading` ou `useCurrentOrg().isLoading` for true, mostrar spinner local em vez de delegar para os hooks individuais. Isso resolve a race condition (Causa 2) sem mexer na arquitetura global.
- Mudar tab default para `'admin'` apenas se houver dados; caso contrário, abrir `'form'` para usuários novos.

### Mudança 7 — `src/components/ErrorBoundary.tsx` (verificar)
- Confirmar que `componentDidCatch` faz `console.error` para que erros silenciosos do dialog/form fiquem visíveis nos logs do Lovable.

---

## Critério de aceite
1. Acessar `/mobility-auth` com conexão lenta ou Supabase degradado **mostra mensagem de erro com botão "Tentar novamente"** em vez de loading infinito.
2. Usuário restrito (`leitura` + `mobility_access`) entra na página sem tela branca, mesmo em hard refresh.
3. Quando não há nenhum integrante cadastrado, mostra "Nenhum integrante encontrado" — não fica preso em "Carregando".
4. Editar/excluir membro continua funcionando normalmente.
5. Logs do navegador (`code--read_console_logs`) param de mostrar warnings de Dialog sem Description (como bônus, ao corrigir EditMemberDialog).
6. Zero alteração no banco, RLS ou edge functions.

## Arquivos modificados
| Arquivo | Mudança |
|---|---|
| `src/hooks/useMobilityMembers.ts` | Expor isError/refetch, gating de `members`, retry/staleTime |
| `src/hooks/useMobilityForms.ts` | Expor isError/refetch, retry/staleTime |
| `src/hooks/useOfficialCommittees.ts` | retry/staleTime |
| `src/components/mobility/MobilityAdminPanel.tsx` | UI de erro + retry, safety guard em committees |
| `src/components/mobility/EditMemberDialog.tsx` | Safety guard `Array.isArray(committees)` |
| `src/pages/MobilityAuthPage.tsx` | Gate de auth/org loading no nível da página |

Sem mudança em RLS, banco, edge functions ou qualquer outro módulo.
