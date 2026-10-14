# Reordenar acessos do portal Fenasoja

## Objetivo
Exibir os acessos do portal nesta sequência, sem alterar rotas, permissões ou qualquer comportamento dos módulos:

1. Agenda Fenasoja
2. Agenda Restaurante e Arena
3. Mapa Comercial
4. Comissões (grupo expansível)
5. Financeiro
6. Administrador

## Situação atual (verificado)
- A ordem de exibição vem exclusivamente do array `portalPrimaryEntries` em `src/modules/portal/portalRegistry.ts` (linhas 93–137): hoje a ordem é agenda-fenasoja, agenda-restaurante-arena, mapa-comercial, **financeiro, administrador, comissoes**.
- `src/pages/commissions/CommissionPortalPage.tsx` (linha 431) renderiza o array na ordem em que ele está; o índice decorativo (`01`, `02`, …) acompanha a posição.
- O teste `src/test/portalArchitecture.test.ts` (linhas 15–21) fixa a ordem atual e precisa ser atualizado.
- Nenhuma regra CSS de `portal-access-navigation.css` depende de posição (`nth-child` etc.); a grade segue a ordem do DOM.

## Mudanças
1. `src/modules/portal/portalRegistry.ts` — mover a entrada `comissoes` para depois de `mapa-comercial`, ficando: agenda-fenasoja, agenda-restaurante-arena, mapa-comercial, comissoes, financeiro, administrador. Nenhuma outra propriedade é alterada.
2. `src/test/portalArchitecture.test.ts` — atualizar a expectativa da ordem para a nova sequência.

## Fora do escopo
- Rotas, guards, permissões, `resolveModuleAccess`, login paths, destinos, descrições e ícones permanecem intactos.
- Sem mudanças no banco, RLS ou publicação.

## Validação
- `npm run typecheck` e build.
- Testes focados: `portalArchitecture.test.ts` (e suíte de portal relacionada).
- Conferência visual opcional no preview (desktop e mobile) para confirmar a nova sequência dos seis cartões, incluindo Comissões expansível na terceira/quarta posição — sem publicar.
