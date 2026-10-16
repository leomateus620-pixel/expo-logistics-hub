# Ações confirmadas — implementação e validação local

16/10/2026. Esta entrega implementa somente novas notas de Arena, reserva de lote e início de negociação. Checklist e Agenda continuam indisponíveis para escrita. Nenhum objeto desta fase foi aplicado ao ambiente Fenasoja por este trabalho.

## Objetos novos

Migration [20261016130000_workers_confirmed_actions.sql](../../../supabase/migrations/20261016130000_workers_confirmed_actions.sql): `ai_actions`, `ai_action_events`, schema privado, payloads/requests privados, projeção autorizada de cards, sete RPCs de usuário, conjunto de IDs visíveis para RLS e redactor privado aditivo. Ordem CREATE → REVOKE/GRANT → ENABLE RLS → POLICY conforme a plataforma. Nenhuma FK para `auth.users`; vínculo composto com conversa/proprietário/org. Nenhuma alteração nas policies, funções, triggers ou grants de negócio existentes.

RPCs: `ai_workers_list_actions`, `ai_workers_get_action`, `ai_workers_propose_action`, `ai_workers_edit_action`, `ai_workers_manual_action`, `ai_workers_confirm_action`, `ai_workers_cancel_action`. Todas usam `_org_id`; alvo de card por `_action_id`; CAS por `_expected_revision`. A resposta é `ActionView` direto; list retorna array. Expiração/falha auditada retorna o card terminal; revisão incorreta, sem acesso, entrada inválida, limite e lock ocupado usam erro sanitizado.

Edge [workers-actions](../../../supabase/functions/workers-actions/index.ts) usa DTO canônico, JWT do usuário, Auth/getUser e associação ativa. [workspace-http](../../../supabase/functions/_shared/workers/workspace-http.ts) compartilha autenticação, CORS e erros fixos com a Edge de rotinas. [action-tools](../../../supabase/functions/_shared/workers/action-tools.ts) compartilha definição/validação com o planejador; só propõe, sem ferramenta de confirmar.

## Garantias e limites

- Confirmação é uma função definer fechada, apenas para três RPCs que já são definer; nenhuma chamada invoker da Agenda ou SQL dinâmico. Guards de organização, capabilities e visibilidade são explícitos antes das leituras mínimas; não se alega RLS automática dentro de um definer.
- Card e grants são bloqueados antes da execução; snapshot compara contexto/versão/estado persistido. Mapa exige lote AVAILABLE, sem reserva/negociação/venda/contrato ativos e sem arquivamento. Não há cancelamento implícito para tornar lote elegível.
- Chamada de negócio, receipt canônico e evento AI confirmam/revertem juntos. A confirmação não aceita payload nem receipt do cliente. Repetição recupera o mesmo resultado; efeitos e auditoria de sucesso não duplicam. Timeout de lock: cinco segundos.
- Expiração usa relógio real depois dos locks. Uma segunda conferência após a RPC reverte também um efeito que terminou tarde por espera em constraint/trigger nativo.
- Corpo exato da nota operacional aparece somente na projeção RPC após autorização; SELECT da tabela contém stub. CPF/CNPJ, telefone, e-mail, PIX, links externos/públicos, segredos, JWT e controles reconhecidos são recusados em nota/formulário. A máscara de CNPJ/JWT precede o matcher legado de telefone para não deixar fragmentos. Filtro de formatos não detecta toda informação pessoal; a nota deve permanecer operacional, pois o RPC existente audita seu corpo integralmente.
- Formulário comercial só recebe empresa/contato e prazo quando necessário. Valores ficam em tabela privada; respostas/diff nunca contêm esses nomes. Documento, telefone, e-mail, valor proposto e notas comerciais são sempre SQL NULL. Conteúdo privado é removido após execução, cancelamento, falha ou expiração observada; não há job privilegiado novo para purga de cards não revisitados ou de usuário sem associação ativa.
- Nenhuma destas ações oferece Desfazer. Nenhuma envia mensagem a terceiros. A seleção de evento/lote usa UUID persistido; Venue deriva ambiente do tipo/ancestral do espaço e abre Histórico. Evento sem alocação reconhecida usa rota base com ID: a abertura exata depende do comportamento da tela existente.
- Helpers nativos de receipt Venue têm grants amplos no ambiente, conforme metadados da ativação. Estas três ações não os usam; nenhum grant antigo foi alterado. Schema privado sem grants é a proteção adicional, independentemente da configuração PostgREST; `pgrst.db_schemas=NULL` não comprova exposição.

## Testes executados

[actions-validation.json](./actions-validation.json): **24 grupos aprovados**, PostgreSQL **16.14**, banco local dedicado `actions_phase23`, identidades/tabelas sintéticas e corpos das três RPCs nativas extraídos sem alteração das migrations. Cobrem papel admin/gestor/operador/leitura/membro com grant, escopo/capability revogada, RLS própria, tentativa de receipt forjado, campos proibidos/PII, snapshots, idempotência e rollback após falha entre negócio e receipt.

Concorrência usa duas conexões físicas e verifica espera real no catálogo do PostgreSQL: mesmo card, dois cards no mesmo lote, confirmar × editar/cancelar, revogação durante espera e expiração durante lock. Trigger de atraso sintético comprova rollback após execução que ultrapassou o prazo. Spy no evento pai verifica que nota não o atualiza; isso não representa um teste integrado dos canais FCM/Google em produção. A RLS de negócio da fixture é sintética; a RLS dos novos objetos é a migration real.

[actions_test.ts](../../../supabase/functions/workers-actions/actions_test.ts): **11 testes Deno aprovados**, incluindo tipo/tamanho de request, schema estrito, auth/associação antes da RPC, interrupção durante Auth, dispatch fechado, recusa de ferramentas proibidas, resposta terminal e erro sem segredo. Typecheck Deno e lint dos quatro arquivos TS desta entrega aprovados.

Reprodução, com Node e Deno no PATH e pacote `pg` já disponível fora do repositório:

```sh
node scripts/workers/actions-qa.mjs --pg-module /caminho/absoluto/node_modules/pg
deno test --allow-env=SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SUPABASE_ANON_KEY,SUPABASE_PUBLISHABLE_KEYS --config supabase/functions/workers-actions/deno.json supabase/functions/workers-actions/actions_test.ts
node node_modules/eslint/bin/eslint.js supabase/functions/_shared/workers/workspace-http.ts supabase/functions/_shared/workers/action-tools.ts supabase/functions/workers-actions/index.ts supabase/functions/workers-actions/actions_test.ts
```

O runner aceita `WORKERS_QA_PG_USER`/`WORKERS_QA_PG_PORT`; mantém host loopback e banco dedicado fixos. Ele recria os schemas somente desse banco sintético, nunca lê `.env` ou URL/chave do projeto. O pacote `pg` não foi adicionado às dependências do app.
