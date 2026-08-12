# Usuário Germano Büttow — Presidente Exporural (agenda com visão restrita)

Criar o login `germanotbuttow@gmail.com` (senha `Fenasoja@2028`), vinculá-lo como Presidente da Comissão Exporural, com acesso apenas a dois menus: **Mapa Comercial** (visualização) e **Agenda Fenasoja** — esta última mostrando **somente os eventos em que ele é responsável ou em que a Comissão Exporural está vinculada**. Todos os demais menus permanecem bloqueados.

## Situação atual (verificado)

- Germano já existe como voluntário *placeholder* (sem login), com vínculo de responsável principal na Comissão Exporural (`commission_responsibles`) — esse vínculo será reapontado para o novo login.
- Hoje qualquer membro da organização enxerga **todos** os eventos da agenda (política de leitura é por organização). A restrição por pessoa/comissão não existe e será criada nesta implementação.

## 1. Visão restrita da agenda (banco de dados)

Nova capability `cronograma_scoped_access`: quem a possui passa a ver apenas eventos vinculados a si. Regra de vínculo de um evento:

- ele é **responsável** pelo evento (vínculo de membro em `cronograma_evento_responsaveis`), **ou**
- o evento tem **comissão** em que ele é responsável ativo (Exporural, via `commission_responsibles`).

Impacto zero para todos os demais usuários (quem não tem a flag continua vendo tudo, incluindo admin/gestor/operador).

## 2. Provisionamento do usuário

Mesmo fluxo usado para Marcos Servat e Dário Germano (função `provision-fenasoja-users`, idempotente):

- Perfil **leitura** (somente consulta — não cria nem edita eventos), cargo "Presidente — Comissão Exporural", equipe 2028.
- Capabilities: `cronograma_eventos_access` + `map.view` + `cronograma_scoped_access`. Nenhuma outra (sem financeiro, sem demais comissões).
- O cadastro antigo de voluntário é desativado; o vínculo de responsável principal da Exporural e o `commission_id` do membro passam a apontar para o novo login.

## 3. Ajuste no app

- A agenda hoje mescla, no navegador, uma lista oficial fixa de eventos a todos os usuários. Para usuários com visão restrita, essa mesclagem será desligada — ele verá apenas os eventos reais retornados (já filtrados pelo banco).
- A entrada do sistema para ele cai no Mapa Comercial (regra já existente para usuários restritos com acesso ao mapa); a Agenda Fenasoja aparece na barra lateral.
- Ações de criar/editar evento já ficam ocultas para perfil leitura (verificado: a tela usa `canWriteEvents`/`canManage`).

## 4. Validação

- Login real como Germano no preview autenticado: agenda mostra somente eventos vinculados a ele/à Exporural; mapa comercial abre em modo visualização; rotas dos demais módulos bloqueadas; botões de criação ausentes.
- Conferência no banco: quantidade de eventos elegíveis bate com a regra (responsável ou comissão Exporural).
- Teste com usuário gestor: agenda continua completa (regressão).

## Detalhes técnicos

- **Migração SQL**: duas funções `SECURITY DEFINER` — `has_scoped_cronograma_access(user, org)` (flag explícita em `user_capabilities`; não usa `has_capability`, que retorna true automático para admin/gestor/operador) e `cronograma_scoped_event_visible(event, user)` (checa vínculo em responsáveis/comissões ignorando RLS, evitando recursão entre políticas). Substitui a política de leitura de `cronograma_eventos` adicionando a condição de escopo; endurece as leituras de `cronograma_subevento_comissoes`, `cronograma_subevento_responsaveis` e `cronograma_evento_anexos` (hoje por organização) com a mesma regra. As demais tabelas relacionais herdam a restrição automaticamente porque suas políticas passam pelo evento-pai, e a view `cronograma_eventos_full` é `security_invoker=on`.
- **Provisionamento**: nova entrada no array `USERS` da função (role `leitura`, `deactivate_duplicates: ["GERMANO TESSMER BÜTTOW"]`), deploy e execução única com o token de worker.
- **Dados** (ferramenta de insert/update): `UPDATE commission_responsibles SET user_id = <novo>` na linha da Exporural; `UPDATE org_members SET commission_id = <exporural>` do novo membro.
- **Frontend**: em `useCronogramaEventos`, se `capSet.has('cronograma_scoped_access')`, usar diretamente os eventos do banco sem `mergeOfficialSeedWithDb`.
- Nenhuma alteração de schema de tabelas; nenhum impacto nos demais usuários.
