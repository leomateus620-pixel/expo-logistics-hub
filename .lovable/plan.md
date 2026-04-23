

## Corrigir tela branca em "Nova Solicitação" do menu Mobilidade

### Diagnóstico
O fluxo `/mobility-auth` → aba **Nova Solicitação** abre tela branca para esse usuário, sem mensagem nem fallback. Três fragilidades concorrem:

1. **Sem ErrorBoundary** ao redor do `MobilityForm` — qualquer exceção durante o render (ex.: `committees` vir com formato inesperado do cache persistido em `localStorage`, falha de rede ao carregar comissões, RLS retornando erro) derruba a árvore inteira para branco em vez de mostrar mensagem amigável.
2. **`MobilityForm` não trata o estado de erro** dos hooks (`useOfficialCommittees`, `useMobilityForms`, `useMobilityMembers`). Se o `useQuery` lança no `queryFn`, o React Query expõe `isError`/`error`, mas o componente só lê `committees` e `isLoading` — nunca o erro. Resultado: usuário sem permissão de leitura em `official_committees` ou com cache corrompido nunca vê feedback.
3. **Cache persistido em `localStorage`** (`fenasoja-query-cache`, `gcTime` de 24h) pode estar restaurando uma resposta antiga inválida no notebook desse usuário específico, fazendo com que `committees.map(...)` ou `committees.find(...)` opere sobre algo não-array.

### Solução em 3 camadas defensivas

**1. ErrorBoundary local em `MobilityAuthPage`**

Envolver cada `<TabsContent>` com um `ErrorBoundary` simples que captura o throw e mostra um card de erro com botão "Tentar novamente" (recarrega a página). Garante que **nunca mais** apareça tela branca silenciosa nesse menu, mesmo se um bug futuro aparecer.

**2. `MobilityForm` defensivo**

- Garantir que `committees` é sempre array antes de `.map`/`.find`: `const safeCommittees = Array.isArray(committees) ? committees : []`.
- Ler `isError`/`error` do hook `useOfficialCommittees` e mostrar uma mensagem clara: *"Não foi possível carregar a lista de comissões. Recarregue a página ou contate o administrador."*
- Estender `useOfficialCommittees` para também devolver `isError` e `error` (hoje só devolve `committees`, `isLoading`, `updateCommittee`).

**3. Botão "Limpar cache local" no card de erro**

No fallback do ErrorBoundary, oferecer ação secundária *"Limpar cache e recarregar"* que faz `localStorage.removeItem('fenasoja-query-cache')` antes do `location.reload()`. Resolve o cenário do cache persistido corrompido nesse notebook específico **sem afetar outros usuários** (cada navegador tem seu próprio cache).

### Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/components/ErrorBoundary.tsx` | Novo | Componente reutilizável `<ErrorBoundary fallback={...}>` baseado em `componentDidCatch`, com card "Algo deu errado" + botões "Tentar novamente" e "Limpar cache local" |
| `src/pages/MobilityAuthPage.tsx` | Edit | Envolver cada `<TabsContent>` com `<ErrorBoundary>` |
| `src/components/mobility/MobilityForm.tsx` | Edit | `safeCommittees` guard, ler `isError`/`error` do hook, mostrar mensagem inline se falhar carregar comissões |
| `src/hooks/useOfficialCommittees.ts` | Edit | Devolver `isError` e `error` no retorno do hook |

### Compatibilidade e risco
- Zero migração de banco, zero mudança em RLS, zero impacto nos outros 99% dos usuários
- Os outros menus (Equipe, Hóspedes, Transportes etc.) continuam exatamente como estão — alteração 100% isolada ao módulo Mobilidade
- Build/preview do app continua idêntico para quem já usa normalmente
- Para o usuário afetado: na próxima vez que abrir "Nova Solicitação", verá um card de erro acionável em vez de tela branca, e o botão "Limpar cache local" deve resolver definitivamente

### Critério de aceite
1. Clicar em **Nova Solicitação** nunca mais resulta em tela branca — pior caso é um card de erro com mensagem e ações
2. Se a lista de comissões falhar ao carregar, o form mostra alerta inline em vez de quebrar
3. Botão "Limpar cache local" remove `fenasoja-query-cache` do `localStorage` e recarrega
4. Nenhum outro fluxo do sistema é afetado

