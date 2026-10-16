# Contrato das ações confirmadas — pesquisa de segurança

Data: 16/10/2026. Documento de planejamento das Fases 2/3, complementar ao [plano](./plan.md). Esta pesquisa não implementa ações, migrations, alterações de grants existentes ou deploy. As assinaturas abaixo foram conferidas no repositório; nomes `ai_workers_*action*` e `workers_private.*` são propostas novas, explicitamente identificadas como tal.

## Decisão para a primeira implementação

Usar um dispatcher **fechado `SECURITY DEFINER`**, restrito a RPCs de negócio que **já são `SECURITY DEFINER`**. Ele valida identidade, associação ativa, permissões, visibilidade e organização; só depois lê os campos mínimos para guards transacionais. Isso não torna suas leituras automaticamente sujeitas à RLS: os guards precisam reproduzir explicitamente o acesso do usuário. Leituras exploratórias e dados enviados à IA continuam no cliente JWT e no registry readonly existentes.

A confirmação pública recebe somente organização, ID do card e revisão esperada. A própria função chama uma RPC estática e grava o receipt mínimo a partir do retorno e do estado persistido, na mesma transação. **Nenhum helper mutável recebe `EXECUTE` de `authenticated`; nenhum endpoint recebe `executed`, capabilities, ator, resultado ou receipt fornecidos pelo cliente.** A decisão substitui, para esta lista inicial, a sugestão de dispatcher invoker do plano. Agenda permanece fora dessa função.

| Candidata | RPC existente | Situação inicial recomendada |
|---|---|---|
| Nova nota de Arena/Restaurante | `venue_save_event_note(uuid,text,uuid)` | Habilitável com `p_note_id = NULL`, nota sem dados sensíveis reconhecidos e guards abaixo. |
| Checklist | `venue_update_checklist_item(uuid,uuid,integer,uuid,jsonb)` | **Indisponível:** alteração do evento pai reconcilia Google Calendar e lembretes push de outras pessoas. Não desabilitar triggers para contornar isso. |
| Reservar lote | `reserve_commercial_lot(uuid,text,text,text,text,text,timestamptz,text)` | Habilitável somente de `AVAILABLE`, sem reserva/negociação ativa e sem inconsistência comercial; dados obrigatórios preenchidos pelo usuário em formulário privado. |
| Iniciar negociação | `start_commercial_negotiation(uuid,text,text,text,numeric,text)` | Habilitável nas mesmas condições; inicialmente passar `p_proposed_value = NULL`, sem sugerir ou alterar preço. |

O bloqueio de checklist decorre dos efeitos existentes, não da falta de capacidade técnica. Agenda, rascunho de evento de espaço, tarefas de Comissão, alterações financeiras, venda, contratos, links públicos, preços e geometria não entram na lista do dispatcher. Nenhuma destas três ações habilitáveis tem Desfazer permitido: remoção da nota e cancelamento comercial estão fora do escopo autorizado.

## Evidências e permissões reais

### Notas novas de Arena

Contrato existente: `venue_save_event_note(p_event_id uuid, p_body text, p_note_id uuid DEFAULT NULL) RETURNS venue_event_notes`. A função é definer, exige `auth.uid()`, resolve a organização do evento, verifica `venue_can_view_event` e exige `venue_events_manage` **ou** `venue_operations_manage`. Valida texto aparado entre 2 e 2.000 caracteres. Na criação, insere a nota e um `audit_log` com o corpo integral; não atualiza `venue_events`. O único trigger encontrado nas migrations sobre `venue_event_notes` é `BEFORE UPDATE`, que atualiza `updated_at`. [RPC, tabela e trigger](../../../supabase/migrations/20260911101225_b5a3559d-dd0c-4e24-9dc2-224ab8e2d4be.sql#L1).

O contrato do bot deve ser **mais restrito** que o nativo: `venue_events_access` + `venue_events_manage`, evento visível da organização escolhida, somente criação, sem `note_id` no schema aceito. O catálogo solicitado pelo usuário exige gestão para a escrita da Arena; o fato de a RPC também aceitar operações não autoriza ampliar esse contrato silenciosamente. Se o produto decidir aceitar operações depois, essa mudança deve aparecer no catálogo e nos testes.

Como a RPC existente audita o corpo sem máscara, bloquear CPF, telefone, e-mail, PIX, segredo e link público com token reconhecidos no texto antes da proposta e novamente no SQL; não alterar silenciosamente a nota para fazê-la passar. Não enviar corpo privado, exceção SQL ou payload a logs/Gateway. O filtro de formatos não identifica toda informação pessoal possível: o formulário deve pedir uma nota operacional sem dados pessoais; conteúdo sensível necessário continua na tela original. Não alterar `audit_log` nem o RPC existente nesta fase.

### Checklist: existe um efeito externo mesmo sem mudar data/título

Contrato: `venue_update_checklist_item(_org_id uuid, _item_id uuid, _expected_version integer, _idempotency_key uuid, _payload jsonb) RETURNS jsonb`. Exige **`venue_operations_manage`**, lock consultivo da organização com seed `28701`, receipt nativo, lock no evento pai e no item, versão exata do item e estado permitido do evento. A RPC reatribui `note`, `responsible_user_id` e `deadline` a partir do payload; ausência desses campos pode apagá-los. O hook preserva os valores atuais explicitamente. [RPC](../../../supabase/migrations/20260727215257_97c52bcb-d741-4523-833f-77b236eddb7b.sql#L1161), [hook](../../../src/hooks/useVenueOperations.ts#L964).

Após atualizar o item, a RPC também incrementa `venue_events.version` e `updated_by`. O trigger `trg_venue_event_notifications`, que roda em **qualquer UPDATE** do evento pai, sempre chama `venue_notification_reconcile_event`. Essa função pode enfileirar upserts/deletes no Google Calendar dos destinatários e cancelar/reagendar lembretes push de uma hora por versão. Portanto, “só mudar o checklist” não garante ausência de efeitos para terceiros. [Atualização do pai](../../../supabase/migrations/20260727215257_97c52bcb-d741-4523-833f-77b236eddb7b.sql#L1243), [reconciliação](../../../supabase/migrations/20261004063922_ba42bb80-24b1-4d9b-ab75-0c82cb7d3824.sql#L239), [trigger e chamada incondicional](../../../supabase/migrations/20261004063922_ba42bb80-24b1-4d9b-ab75-0c82cb7d3824.sql#L299), [instalação](../../../supabase/migrations/20261004063922_ba42bb80-24b1-4d9b-ab75-0c82cb7d3824.sql#L421).

O guard de eventos oriundos da Agenda permite mudanças operacionais que preservem seus campos protegidos; ele não impede essa reconciliação. Não há exceção de bot nos triggers. [Guard do vínculo](../../../supabase/migrations/20261006120000_cronograma_restaurant_bridge.sql#L363). Manter a ação indisponível para todos os papéis enquanto a regra de não gerar mensagens/efeitos externos para terceiros prevalecer.

Se futuramente autorizada com esses efeitos, a revisão do card precisa conter versão do item **e do evento**, status e fase do item, status do evento, nota/responsável/prazo atuais e a mudança exata. Payload efetivo deve preservar campos não editados. `dispensado` exige justificativa mínima de oito caracteres; evento cancelado/recusado/bloqueado é imutável; concluído só admite item de `pos_evento`. Não prometer reversão automática.

### Reserva e negociação do Mapa

Ambas as RPCs são definer, bloqueiam o lote com `FOR UPDATE`, derivam a organização por `map_projects` e exigem `map_has_explicit_capability(org,'map.manage_sales')`. Não possuem argumento de versão ou chave idempotente própria. [Definições](../../../supabase/migrations/20260805012455_1844f1ca-ea09-4776-96f3-3d04eaf64ca6.sql#L43).

| RPC e argumentos, na ordem real | Validação/efeitos nativos relevantes |
|---|---|
| `reserve_commercial_lot(p_lot_id uuid, p_company_name text, p_document_number text, p_contact_name text, p_phone text, p_email text, p_expires_at timestamptz, p_notes text) → uuid` | Aceita `AVAILABLE` **ou `IN_NEGOTIATION`**; exige empresa e contato; prazo futuro. Cria reserva, **cancela negociações ACTIVE**, muda lote para `RESERVED` e grava histórico/atividade. |
| `start_commercial_negotiation(p_lot_id uuid, p_company_name text, p_document_number text, p_contact_name text, p_proposed_value numeric, p_notes text) → uuid` | Aceita `AVAILABLE` **ou `RESERVED`**; exige empresa. **Cancela reservas ACTIVE**, cria negociação, muda lote para `IN_NEGOTIATION` e grava histórico/atividade. |

Os parâmetros opcionais de negócio recebem SQL NULL no serviço existente; as tipagens geradas os mostram obrigatórios, então a assinatura SQL e o serviço são a referência de nulabilidade. [Serviço](../../../src/features/commercial-map/services/commercialMapService.ts#L1166), [tipos de reserva](../../../src/integrations/supabase/types.ts#L11770), [tipos de negociação](../../../src/integrations/supabase/types.ts#L11874). Índices únicos limitam uma reserva e uma negociação ACTIVE por lote, separadamente; eles não impedem coexistência entre as duas tabelas. [Tabelas/índices](../../../supabase/migrations/20260710010000_create_commercial_map.sql#L229).

Guard adicional obrigatório do bot: projeto/entidade/lote existentes e não arquivados, organização real igual ao card, `can_view_commercial_map(org)` e `map_has_explicit_capability(org,'map.manage_sales')`, lote **estritamente `AVAILABLE`**, nenhuma operação ACTIVE em qualquer das duas tabelas. Recusar também venda/contrato ativos e divergências de elegibilidade comercial; não “corrigir” estado nem expirar/cancelar uma operação para tornar o lote elegível. Os indicadores existentes estão em `commercial_sale_eligibility`, mas um definer não deve presumir que `security_invoker` dessa view restaura o usuário original. [Elegibilidade](../../../supabase/migrations/20260926072729_6daace25-33f1-4668-b879-04b5c306be7f.sql#L14).

O snapshot mínimo contém IDs persistidos de lote/projeto/entidade/segmento quando houver, identificação comercial exibida, status, `updated_at`, arquivamento e indicadores de operações/venda/contrato. Não armazenar geometria, comprador, documentos, preço ou histórico integral. A identidade exibida deve vir das entidades/revisões persistidas, não ser deduzida de UUID, código técnico ou número repetido.

As migrations encontradas para estas tabelas definem touch de `updated_at`, sync de segmento em mudanças de `block/entity_id` e proteção contra DELETE com contrato; não encontrei trigger de envio externo para a criação de reserva/negociação ou mudança apenas de status do lote. Isso é uma constatação estática, a confirmar no catálogo `pg_trigger` do ambiente implantado. [Touch](../../../supabase/migrations/20260805012455_1844f1ca-ea09-4776-96f3-3d04eaf64ca6.sql#L227), [sync seletivo](../../../supabase/migrations/20260805024054_f6ec5234-96e6-4205-92a1-57e4cad25639.sql#L411), [proteção de exclusão](../../../supabase/migrations/20261002174858_39245a81-8ef9-4ec3-8a85-b0fc92900d85.sql#L26).

### Matriz de confirmação por papel

Todos os casos exigem card do próprio usuário, associação ativa e organização do registro igual à do card. “Comissão” é um escopo adicional, não um quinto `org_role`; use o papel e os grants reais desse membro. `app_role=admin` isolado não dispensa associação/escopo da organização.

| Ação do bot | admin da org | gestor | operador | leitura | Membro de comissão |
|---|---|---|---|---|---|
| Nova nota | Permitida, evento visível | Permitida, evento visível | Só com `venue_events_manage` efetivo e acesso | Só com `venue_events_manage` efetivo e acesso | Mesma regra do papel/grants; vínculo isolado não autoriza |
| Checklist | Indisponível | Indisponível | Indisponível | Indisponível | Indisponível |
| Reserva/negociação | Permitida se guards comerciais passarem | Permitida se guards passarem | Requer `map.manage_sales`/`map.admin`/`full_access` efetivo e visão do mapa | Requer visão do mapa + gestão comercial efetiva | Mesma regra; capability de um segmento isoladamente não concede gestão comercial |

`venue_has_capability` inclui gestão para admin/gestor; operador recebe operações, mas **não gestão de eventos** por padrão. `venue_can_view_event` também valida acesso e visibilidade restrita. `map_has_explicit_capability` inclui admin/gestor ou grant solicitado/`map.admin`/`full_access`, sempre com membro ativo; seu ramo de service role não pode ser usado pelos bots. `can_view_commercial_map` admite operador ou visão explícita. [Venue capabilities](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L18), [visibilidade](../../../supabase/migrations/20260727213855_e641c831-878e-4983-a4c7-ce5fa5d3aaa5.sql#L634), [Map capabilities](../../../supabase/migrations/20260805023923_e2e83fac-31b4-4cc6-98d0-aa767827fee7.sql#L133), [Map view](../../../supabase/migrations/20260805011308_bfacf637-b666-435a-88a4-8d9af2ba5f61.sql#L394), [segmento persistido](../../../supabase/migrations/20260929212323_92cbb10a-72dc-44bf-9b26-d0971b346b92.sql#L1).

## Por que esconder helpers no schema não comprova execução

Um helper em schema não exposto ao PostgREST fica fora da descoberta HTTP normal, mas `USAGE` no schema + `EXECUTE` continuam permitindo chamá-lo em SQL. Um `finish(action_id, result)` acessível a `authenticated` permitiria marcar o card como executado sem provar que o negócio ocorreu. Mesmo um resultado reconstruído de uma linha existente não comprova que aquela confirmação criou essa linha. Hash, GUC, um booleano “server”, nome do worker, role/capability enviados pelo cliente ou um receipt nativo recebido do Edge não resolvem isso.

O controle escolhido é por privilégios e fluxo fechado: só a função confirmadora pode executar a mudança e gravar seu receipt. Helpers internos e tabelas de payload/receipt não têm privilégios para `PUBLIC`, `anon` ou `authenticated`, inclusive em SQL direto. O invoker não deve ganhar acesso a esses helpers para “funcionar”. O comportamento de invoker/definer, o cuidado com `search_path` e a remoção do EXECUTE público padrão estão documentados no [PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html).

Há precedente de helpers privados na ponte Agenda, mas ele não deve ser copiado como prova suficiente: a função pública de Agenda é invoker e precisa executar helpers privados concedidos a authenticated; seu desenho reconstrói resultados de dados persistidos. Aqui podemos evitar essa superfície mantendo Agenda fora da lista. Os helpers nativos `venue_begin_mutation`/`venue_finish_mutation` recebem payload/resultado, porém o repositório revoga seu EXECUTE de PUBLIC e não contém grant direto para authenticated. Isso deve ser confirmado no ambiente, sem alterar os grants existentes. [Ponte/helpers](../../../supabase/migrations/20261006120000_cronograma_restaurant_bridge.sql#L407), [receipts nativos](../../../supabase/migrations/20260727214559_4eb4b9bb-7fb5-4781-b848-ee471b976d91.sql#L118), [revogação](../../../supabase/migrations/20260727214922_f34ac08d-05e4-41e8-ba92-5f270abcb6e1.sql#L48).

**Alternativa para uma futura ação invoker:** witness de efeito escrito por trigger de metadados, com contexto privado por transação/backend e validação do alvo/payload; finalização deriva o receipt desse witness, sem resultado fornecido pelo chamador. O trigger só escreveria tabelas AI e seria no-op fora desse contexto. Triggers participam da transação da mudança, conforme o [PostgreSQL](https://www.postgresql.org/docs/current/trigger-definition.html). Essa alternativa exige auditoria adicional e novos triggers em tabelas existentes; não é necessária nem proposta para a primeira implementação. Não envolver RPC invoker da Agenda no dispatcher definer.

## Contrato SQL proposto, sem implementação nesta pesquisa

### Objetos e privilégios novos

| Objeto proposto | Conteúdo e acesso |
|---|---|
| `public.ai_actions` | ID, org/user/conversa, tipo fechado, revisão, status `proposed\|confirmed\|executed\|cancelled\|expired\|failed`, expiração, snapshot/diff mascarados, alvo, receipt mínimo e timestamps. SELECT próprio + org ativa; sem DML do cliente. FK composta da conversa impede ligação entre usuários/orgs. |
| `workers_private.ai_action_payloads` | Payload exato por card/revisão, chave de operação gerada no SQL e hash canônico privado. Sem schema USAGE, tabela SELECT/DML ou função EXECUTE para clientes. Campos pessoais manuais nunca entram no chat, diff, logs, provider ou resposta da função. |
| `public.ai_action_events` | Eventos append-only próprios, ligados por FK composta ao card: proposta/edição/confirmação/execução/cancelamento/expiração/falha. Ator derivado de `auth.uid()`, códigos fixos e dados mínimos; sem corpo da nota, contato ou exceção SQL. SELECT próprio + org ativa; sem DML do cliente. |

Não alterar os CHECKs atuais de `ai_messages.role` e `ai_audit_events.event` para inserir eventos de ação. Não criar FK de tabela pública para `auth.users`; usar o vínculo composto com conversa e validar identidade/associação em RPCs/RLS. Seguir a ordem exigida pelo Lovable: CREATE TABLE → REVOKE/GRANT → ENABLE RLS → CREATE POLICY, numa única migration/transação aditiva. Reutilizar o conjunto `ai_workers_member_org_ids()` nas policies próprias, sem policies por linha sobre negócio. [Schema atual](../../../supabase/migrations/20261016120000_workers_readonly_workspace.sql#L3).

As funções abaixo são **novos contratos sugeridos**, não RPCs hoje disponíveis:

| Entrada pública proposta | Retorno/efeito permitido |
|---|---|
| `ai_workers_propose_action(_org_id uuid, _conversation_id uuid, _request_id uuid, _action_type text, _target_id uuid, _input jsonb) → jsonb` | Valida allowlist, tamanho/chaves exatas, identidade/permissões/registro; lê snapshot mínimo autorizado e gera card, chave privada, revisão 1 e expiração `clock_timestamp()+15min`. Não chama RPC de escrita. |
| `ai_workers_edit_action(_org_id uuid, _action_id uuid, _expected_revision integer, _request_id uuid, _input jsonb) → jsonb` | Lock no card; somente proposed e ainda válido. Revalida escopo/permissões; gera novo snapshot/diff, revisão/chave novas e nova validade explícita. Invalida revisão anterior. Não modifica negócio. |
| `ai_workers_cancel_action(_org_id uuid, _action_id uuid, _expected_revision integer) → jsonb` | Lock no card próprio; cancela somente proposta válida ou registra expiração; audita. Nunca chama inversa de negócio. |
| `ai_workers_confirm_action(_org_id uuid, _action_id uuid, _expected_revision integer) → jsonb` | Transação atômica descrita abaixo. Não aceita payload, nome de RPC, capability, receipt ou dados de sucesso. |

Todas são autenticadas; checar também `auth.role() = 'authenticated'`, `auth.uid()` não nulo e vínculo ativo, recusando token de service role. A confirmação não pertence ao tool-calling do modelo. O modelo só pode propor; a UI faz uma requisição separada após confirmação explícita, com ID/revisão exibidos. Uma requisição HTTP com JWT não é prova criptográfica de um gesto humano; o que o banco garante é o protocolo confirmado, a permissão e o efeito atômico.

Definer com `search_path` restrito a schemas confiáveis, `pg_catalog` e `pg_temp` por último; referenciar tabelas, helpers e RPCs por schema e assinatura/tipos exatos. Não usar SQL dinâmico, nome de função recebido, `SET ROLE`, alteração de claims/JWT, flag de bypass, trigger desligado, `session_replication_role`, ou service client. Revogar EXECUTE padrão de PUBLIC na criação; conceder apenas as quatro entradas de usuário necessárias. Helpers mutáveis privados ficam sem grants de cliente e sem wrapper genérico.

### Snapshot, idempotência e confirmação atômica

1. Revalidar autenticação/organização; localizar e bloquear o card próprio com `FOR UPDATE`. Não revelar se um ID alheio existe. Verificar revisão antes de tratar repetição; uma revisão antiga não confirma a nova.
2. Revalidar e bloquear a associação ativa e os grants efetivos usados na autorização, em ordem estável. Revogação/alteração anterior ao lock deve impedir a ação; uma revogação concorrente espera o término da operação autorizada que já obteve o lock. Nunca usar a capability capturada na proposta como autorização de execução.
3. Se já executado, retornar o **mesmo receipt armazenado**, após os gates atuais de acesso; não reexecutar nem recalcular o efeito a partir do estado comercial atual. Cancelled/expired/failed são terminais. `confirmed` é uma etapa dentro da transação, sem janela persistida de execução posterior por job.
4. Para notas, usar a ordem compatível de lock da organização Venue (`hashtextextended(org,28701)`) e evento pai. Conferir org real, visibilidade, versão/status do pai e snapshot exibido. Notas não têm versão/idempotência nativa; a linha do card protege essa chamada. Para Mapa, bloquear lote, projeto/entidade e registros existentes de reserva/negociação em ordem estável antes do guard final; a trava do lote segue o padrão das RPCs existentes. Não bloquear item Venue antes do advisory lock da organização.
5. Recomparar snapshot mínimo após os locks; recusar conflito/arquivamento/operação ativa. Não atualizar o snapshot silenciosamente no Confirmar. Alteração requer Editar e revisão nova. Para Mapa, não há versão própria do lote: comparar os campos persistidos relevantes, incluindo `updated_at`; não inventar `lock_version`. Bloquear também linhas de operações inativas existentes evita que sejam promovidas a ACTIVE entre a conferência e a chamada; o guard não deve depender apenas de status do lote ou de duas contagens antigas.
6. Consultar **`clock_timestamp()` depois dos locks** e antes de executar. Expiração do card e prazo da reserva usam relógio atual, não `now()` fixo do início da transação. Card expirado passa a expired sem efeito. Definir espera limitada por lock, retornando busy/retry seguro; não manter chamada esperando por toda a validade do card.
7. Chamar exatamente uma RPC da allowlist com payload privado validado, ator JWT original e argumentos estáticos. Nova nota sempre usa NULL no terceiro argumento. Mapa só de AVAILABLE e sem operações ativas, de modo que os UPDATEs nativos de cancelamento afetem zero linhas. A confirmação não chama expire, cancel, delete ou rotina financeira.
8. Validar o retorno contra o registro persistido dentro da função: nova nota pertence ao evento/org/autor esperados e não está excluída; UUID comercial retornado pertence ao lote/autor esperados, está ACTIVE e corresponde ao tipo e campos privados propostos. Montar receipt com action/revisão/tipo/IDs/status/timestamps, sem corpo/contato/documento/preço. Só então marcar executed e inserir evento de sucesso.
9. Gravação de negócio, receipt e auditoria AI devem confirmar ou reverter juntas. Uma falha no receipt/evento não deixa escrita de negócio solta. Para registrar falhas, usar bloco de exceção/subtransação: reverter chamada de negócio antes de registrar somente código sanitizado no card/auditoria. Erros retryable podem reverter toda a confirmação sem consumir a chave; nunca gerar chave nova automaticamente para tentar outra escrita.

Idempotência de proposta/edição usa `_request_id` do cliente + proprietário/org e hash canônico do pedido; reuso com payload diferente é mismatch, não outra proposta. Chave da operação de negócio nasce no SQL e não é editável/visível. Unique por card/revisão e lock do card garantem um efeito por confirmação; duas propostas distintas sobre o mesmo lote ainda disputam o lock do lote, e a segunda deve falhar ao encontrar o novo status. Depois de sucesso/expiração/cancelamento, retirar conteúdo pessoal do payload privado quando não for mais necessário, preservando IDs, hash privado e auditoria mascarada.

O receipt não usa dados de sucesso enviados pelo Edge; a integridade decorre dos privilégios fechados e da transação, não de hash ou convenção de chamada. Não implementar `claim` que libera o lock e faz a RPC em outra conexão: notas e operações comerciais não possuem idempotência nativa suficiente para essa janela. Se a conexão cair após o commit, repetir a mesma confirmação recupera o receipt; se o SQL for cancelado antes do commit, a transação reverte. O usuário não deve receber “executado” antes do receipt.

### Formulário privado e links

Na reserva, empresa/contato e prazo devem ser completados manualmente; documento/telefone/e-mail opcionais começam NULL. Na negociação, empresa é obrigatória, contato/documento opcionais começam NULL e valor proposto começa NULL. Se o produto habilitar esses campos opcionais depois, continuam privados e nunca preenchidos/inferidos pelo modelo. Uma nota comercial também precisa passar pelo bloqueio de informação sensível porque os RPCs existentes a copiam para histórico/atividade. Validar em Edge **e** SQL; cliente modificado não pode contornar.

Usar apenas rotas reais `/eventos-restaurante-arena` e `/mapa-comercial`, junto dos IDs estruturados do registro afetado. Não inventar query string que a tela não lê. Abrir um registro específico exige adaptar a seleção da tela de forma explícita na implementação, preservando renderização/geometria do mapa. [Rotas Venue](../../../src/App.tsx#L521), [rota canônica](../../../src/lib/venue-operations.ts#L4).

## Verificação obrigatória da exposição e do ambiente

O [config.toml](../../../supabase/config.toml) atual configura funções, mas não declara `[api].schemas`. Portanto, ele **não comprova** quais schemas o PostgREST implantado expõe. A configuração de schemas expostos precisa ser confirmada no projeto Lovable/Supabase antes da ativação. Configuração obtida por `current_setting('pgrst.db_schemas', true)` pode ser nula se a origem estiver fora da sessão: resultado nulo não é prova de isolamento. A API só permite selecionar schemas configurados, conforme o [PostgREST](https://docs.postgrest.org/en/stable/references/api/schemas.html).

Inspecionar metadados (sem ler negócio): `pg_proc.prosecdef`, `proconfig`, proprietário, `pg_namespace`, `pg_trigger`/funções encadeadas, `pg_policies`, privilégios efetivos de schema/tabelas/funções, grants herdados e default privileges. Confirmar assinaturas implantadas iguais às lidas aqui. Provar que `authenticated` e `anon` não têm USAGE/EXECUTE no schema privado, nem DML em metadados AI; uma tentativa SQL direta deve falhar mesmo que o ambiente exponha o schema por engano. Acrescentar probe HTTP com `Content-Profile` do schema privado sem tratar apenas sua ausência na documentação como segurança.

Não alterar grants, policies ou triggers existentes para cumprir esses testes. Divergência relevante do ambiente invalida a ação afetada até revisão; não substituir RPC nem supor que a migration local já foi aplicada. O escopo desta pesquisa não executou essa inspeção remota ou testes de escrita no ambiente Fenasoja.

## Testes necessários na implementação

| Grupo | Evidência exigida |
|---|---|
| Receipt não forjável | SQL como authenticated tenta helper privado, DML em card/status/receipt, payload/capability/result extras e chamada com nome de RPC arbitrário. Tudo recusado. Confirmar uma ação válida sem passar por Edge ainda executa os mesmos gates, uma RPC e um receipt verdadeiro. |
| Papéis e escopo | Matriz acima, sem grant/com grant, membro inativo, troca de org/usuário, org de registro divergente, evento restrito, mapa sem visão, sales sem associação e revogação entre proposta/confirmação. Incluir bloqueio de service role na entrada. |
| Duas conexões PostgreSQL | Confirmar o mesmo card simultaneamente: um INSERT comercial/nota, um receipt, uma execução auditada; ambas respostas têm mesmo resultado. Concorrer confirmar × editar/cancelar; revisão antiga nunca executa. Dois cards no mesmo lote: só uma operação. Verificar lock timeout e expiração enquanto aguarda lock. |
| Falhas atômicas | Falha forçada depois da RPC e antes do receipt/auditoria reverte nota/reserva/negociação e seu histórico. Reconexão/repetição após perda de resposta recupera receipt, sem segundo efeito. Receipt/erro do cliente não altera estado. |
| Preservação | Nenhum cancelamento implícito: lote AVAILABLE com operação ativa é recusado e nenhuma linha histórica muda. Nenhuma alteração em venda/contrato/pagamentos/preços/geometria/linhagem. Nota não incrementa versão do evento pai. |
| Efeitos externos | Em fixtures com destinatário terceiro, associação Google e lembrete: notas/reserva/negociação não alteram outboxes/push/e-mail. Checklist retorna indisponível e não chama RPC. Teste específico demonstra o efeito do RPC original de checklist sem transformar esse teste em permissão de habilitá-lo. |
| Dados e snapshot | PII/segredo/token em texto reconhecido recusados; campos manuais não aparecem em prompt/log/diff/receipt. Chaves extras/nulos/tipos inválidos recusados. Registro renumerado, arquivado ou alterado exige nova revisão; não usar número de lote como identidade. |

PGlite serializado é útil para grants/RLS/checks, mas não prova concorrência entre duas conexões. Esses testes devem usar PostgreSQL real isolado com identidades sintéticas; não criar registros de negócio na produção para validar. Esta etapa fez apenas leitura de código e documentação: **nenhum teste por papel, teste concorrente ou mudança de negócio foi executado por esta pesquisa**.
