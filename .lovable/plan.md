## Objetivo
Dar a Soltis, Djeison, Fernanda, Cléo e Zélia acesso total ao módulo "Cronograma e Eventos" — incluindo o botão Excluir que hoje só aparece para `admin`/`gestor`. Sem mudanças de UI ou de código: apenas atualização de papéis em `org_members` (via `insert` tool).

## Diagnóstico confirmado
- `canDeleteSubevents = myRole === 'admin' || myRole === 'gestor'` em `src/hooks/useCronogramaEventos.ts:1088`. Por isso Soltis (hoje `operador`) não vê o botão.
- Estado atual em `org_members` (org FENASOJA `985888b8-…`):
  - Soltis (`soltis.fs@gmail.com`) — operador
  - Djeison (`djeisondrey@gmail.com`) — operador
  - Fernanda (`fer.secklereich@gmail.com`) — operador
  - Cléo (`fenasojafeira@gmail.com`) — operador
  - Zélia (`zelia.savoldi@hotmail.com`) — operador

## Mudanças de dados (uma única execução)
1. `org_members.role = 'admin'` para Soltis e Djeison.
2. `org_members.role = 'gestor'` para Fernanda, Cléo e Zélia (`zelia.savoldi@hotmail.com`) — equivale a "Técnico" com acesso total ao Cronograma (inclusive Excluir).
3. `user_roles`: garantir linha `role='admin'` para Soltis e Djeison (mantém coerência com o RBAC global).
4. Nenhuma alteração para `zelia@fenasoja.com.br` (permanece `leitura`, conforme sua escolha).

## Verificação
- Reconsultar `org_members` + `user_roles` dos 5 usuários e confirmar os novos papéis.
- Pedir ao Soltis (ou testar em nova sessão) que reabra `/cronograma-eventos` — o botão "Excluir" passa a aparecer no drawer/mobile.

## Não incluso
- Sem alteração de RLS, capabilities ou código. `gestor` e `admin` já têm acesso pleno ao módulo via lógica existente (`hasFullAccessByRole` em `CapabilitiesProvider`).
