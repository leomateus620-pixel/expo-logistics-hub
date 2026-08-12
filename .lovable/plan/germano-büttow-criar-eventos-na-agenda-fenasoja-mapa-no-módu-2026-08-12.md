# Germano Büttow — criar eventos na Agenda Fenasoja + mapa no módulo Exporural

Evoluir o acesso do Germano (presidente da Exporural, visão restrita): ele passa a **criar e editar eventos** na Agenda Fenasoja (mantida a visão restrita: só eventos vinculados a ele ou à Exporural) e o **Mapa Comercial** deixa de ser o mapa geral e passa a ser acessado **pelo portal da Exporural** (escopo das Quadras R/S), em modo visualização.

## Situação atual (verificado)

- O login `germanotbuttow@gmail.com` **ainda não existe no banco** — a função de provisionamento foi atualizada e publicada, mas nunca executada. O vínculo de presidente da Exporural ainda aponta para o cadastro antigo (placeholder, sem login).
- A escrita no cronograma é bloqueada para o perfil `leitura` em três camadas, todas por papel (admin/gestor/operador): o hook da agenda (esconde o botão "Novo evento" e a edição), a função de banco `_cronograma_require_writer` (usada pelos RPCs de salvar) e 6 políticas de escrita (eventos, subeventos, responsáveis, comissões e logs).
- O portal Exporural (`/comissoes/exporural/mapa-comercial`) já existe e é liberado pela capability `exporural_access`; hoje o Germano tem `map.view` (mapa geral, todos os segmentos) e a entrada do sistema o joga nesse mapa geral.

## 1. Escrita na Agenda Fenasoja (banco de dados)

Nova capability `cronograma_eventos_write`, concedida só a quem deve escrever sem ter papel elevado.

- **Função `_cronograma_require_writer`**: passa a aceitar quem possui `cronograma_eventos_write` (via `has_capability`, que já cobre automaticamente admin/gestor/operador — zero impacto para os demais).
- **Políticas de escrita** de `cronograma_eventos` (inserir/atualizar), `cronograma_subeventos`, `cronograma_evento_responsaveis`, `cronograma_evento_comissoes` e `cronograma_evento_logs` (inserir): adicionam a alternativa "ou possui `cronograma_eventos_write`".
- **Blindagem da visão restrita**: na política de atualização de eventos, usuários com a flag de escopo só atualizam eventos visíveis a eles (`cronograma_scoped_event_visible`) — ele edita o que criou/está vinculado, nunca eventos fora do escopo. Nas tabelas filhas isso já vale automaticamente (a verificação passa pelo evento-pai visível).
- **Exclusão continua bloqueada**: apagar eventos segue restrito a admin/gestor (regra já existente, mantida).

## 2. Escrita na Agenda (frontend)

Em `useCronogramaEventos.ts`: nova condição `pode escrever = papel com escrita OU capability cronograma_eventos_write`, aplicada em `canWriteEvents` (faz o botão "Novo evento" aparecer), `canManage` (edição no drawer do evento) e na trava de criar subevento. O responsável do evento já é fixado automaticamente no usuário logado (regra existente), garantindo que todo evento criado por ele permaneça visível na visão restrita. Seed de dados oficiais e exclusão continuam restritos a papéis elevados.

## 3. Mapa Comercial via módulo Exporural

- **Capability `exporural_access`** libera o portal `/comissoes/exporural/mapa-comercial` (guarda de módulo e menu lateral já filtram por ela — o menu "Exporural" aparece automaticamente).
- **`resolveMapPermissions`**: visualização do mapa passa a aceitar as capabilities de portal (`exporural_access` / `industria_comercio_servicos_access`) — hoje só aceita `map.view`. Permissões de edição do mapa permanecem bloqueadas para ele (modo visualização).
- **Remover `map.view`** do Germano: o mapa geral (`/mapa-comercial`, todos os segmentos) fica bloqueado; o acesso é somente pelo recorte da Exporural.
- **Entrada do sistema** (App.tsx): usuário restrito com capability de portal de mapa é direcionado ao mapa do seu portal (Exporural), em vez do mapa geral.

## 4. Provisionamento e dados

- Atualizar o cadastro do Germano na função `provision-fenasoja-users`: capabilities finais = `cronograma_eventos_access`, `cronograma_eventos_write`, `cronograma_scoped_access`, `exporural_access` (sem `map.view`). Deploy e **execução** da função (pendente desde a implantação original — cria o login, perfil leitura, cargo "Presidente — Comissão Exporural", e desativa o cadastro placeholder).
- Dados: reapontar `commission_responsibles` da Exporural para o novo login; vincular `org_members.commission_id` à Exporural; remover a capability `map.view` residual (o provisionamento só adiciona, não remove).

## 5. Validação

- Login como Germano: botão "Novo evento" visível; criar evento com sucesso e o evento aparece na agenda dele; edição permitida, exclusão ausente.
- Entrada cai no Mapa Comercial da Exporural (escopo R/S, sem edição); mapa geral bloqueado; demais módulos bloqueados.
- Regressão com usuário gestor: agenda completa e escrita funcionando como antes.

## Detalhes técnicos

- **Migração SQL**: `CREATE OR REPLACE FUNCTION public._cronograma_require_writer` usando `public.has_capability(auth.uid(), _org_id, 'cronograma_eventos_write')` (security definer, sem recursão de RLS); `DROP POLICY` + `CREATE POLICY` em `cronograma_eventos` (insert/update — update com a condição extra de escopo), `cronograma_subeventos`, `cronograma_evento_responsaveis`, `cronograma_evento_comissoes` e `cronograma_evento_logs` (insert), todas adicionando `OR public.has_capability(auth.uid(), <org>, 'cronograma_eventos_write')`. Nenhuma tabela nova; nenhum GRANT necessário.
- **Frontend**: `src/hooks/useCronogramaEventos.ts` (consome `useCapabilities`, nova expressão `canWriteCronograma`); `src/features/commercial-map/utils/permissions.ts` (canView aceita capabilities de portal); `src/App.tsx` (redirect de entrada para o mapa do portal quando o usuário restrito não tem `map.view`). Página do cronograma e drawer não mudam — já consomem `canWriteEvents`/`canManage`.
- **Dados** (ferramenta de dados, após executar o provisionamento): updates em `commission_responsibles` e `org_members`; delete da capability `map.view` do Germano.
