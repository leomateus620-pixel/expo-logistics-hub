# Bots Fenasoja — plano das Fases 2 e 3

Data: 16/10/2026. Base: PR #202, merge `6ebf3c8c344e36a108e4fe7ef0803b93a6f380f7`.

Pesquisas que detalham as decisões: [ações](action-contract-research.md), [rotinas e autenticação](routines-contract-research.md), [contrato de interface](ui-contract-research.md). São propostas; o DTO final compartilhado será consolidado na implementação, sem presumir que todos os nomes propostos já existem.

Leonardo solicitou primeiro planejamento, depois implementação; autorizou ativar o backend existente pelo Lovable e desenvolver as Fases 2 e 3 juntas. Não inclui publicação do frontend, configuração da Fase 4 ou mudança dos canais FCM/Google.

## 1. Ativar e verificar a base já revisada

Aplicar exclusivamente as migrations `20261016120000_workers_readonly_workspace.sql` e `20261016120100_workers_interest_scoped_reads.sql` pelo ambiente Lovable Fenasoja, e implantar `workers-orchestrator` com suas dependências compartilhadas. Preservar `verify_jwt = true`. Verificar tabelas, RLS, grants, assinaturas e respostas sem autenticação. Não executar consultas de negócio com credencial administrativa, nem criar dados de negócio para testar produção.

Ativação concluída: migrations aplicadas como versões 0007/0008 no ambiente Lovable Fenasoja; tabelas, grants, RLS/policies e assinaturas conferidos. A PR #203 corrigiu a compatibilidade com as regras da plataforma; a PR #204 empacotou a registry canônica dentro da árvore Edge. `workers-orchestrator` foi implantada mantendo JWT obrigatório. POST sem Authorization retorna 401; OPTIONS retorna 204. Evidências em [activation-status.json](activation-status.json), [deployed-rls-audit.json](deployed-rls-audit.json) e [edge-registry-packaging.md](edge-registry-packaging.md). Nenhuma outra função, dado de negócio ou frontend foi publicado.

## 2. Ações confirmadas (Fase 2)

- Novos objetos aditivos: `ai_actions`, `ai_action_events` e helpers privados de metadados; contratos e RPCs explicitamente novos, sem presumir APIs existentes.
- Card com proprietário/organização/conversa, ação da allowlist, versão, chave idempotente, payload privado, diff mascarado, estado esperado, validade de 15 minutos e resultado mínimo.
- Propor não executa. Confirmar recebe ID/versão; uma transação bloqueia o card, revalida associação/capabilities/escopo/expiração e estado do registro, chama a RPC existente e persiste receipt. Repetição retorna o mesmo receipt. `clock_timestamp()` após adquirir o lock. Decisão após auditoria: dispatcher fechado `SECURITY DEFINER` somente para RPCs de negócio que já são definer (nota e operações comerciais), com checagens explícitas anteriores aos guards mínimos e sem helpers mutáveis acessíveis ao cliente. Isso impede receipts forjados. Nenhuma RPC invoker da Agenda pode ser adicionada a esse dispatcher, pois isso elevaria seu acesso; sua habilitação exigiria outro desenho.
- Editar regenera diff no servidor e invalida a versão anterior. Cancelar/expirar/falhar preserva auditoria. Sem promessa de Desfazer quando não existe inversa segura.
- Edge autenticada `workers-actions`; o modelo pode propor, mas não tem ferramenta de confirmar. Histórico estruturado separado do CHECK atual de mensagens/auditoria.

### Auditoria de efeitos indiretos

Prioridade de implementação: notas novas da Arena e operações comerciais seguras, após conferir triggers e contratos. Checklist exige `venue_operations_manage`, não apenas `venue_events_manage`, e permanece bloqueado: incrementa o evento pai e aciona reconciliação de notificações/Google dos responsáveis. Nenhum trigger existente será modificado.

Reservas/negociações comerciais somente se lote `AVAILABLE`, sem operação ativa; campos pessoais obrigatórios preenchidos manualmente, sem modelo. As RPCs cancelam operações anteriores implicitamente, portanto o guard é obrigatório.

Agenda exige controle de versão e restrição de relações/encaminhamento que possam apagar vínculos, enviar notificações ou cancelar evento de espaço. `cronograma_save_subevent_plan` apaga/recria relações e fica indisponível. `venue_save_event` envia notificações inclusive em rascunho e fica indisponível. Tarefas de Comissão continuam indisponíveis porque não há RPC segura de criação. Não desabilitar triggers existentes para contornar essas restrições. Registrar qualquer ação adicional não habilitada no relatório.

## 3. Rotinas, memória e uso (Fase 3)

- Novas tabelas próprias: `ai_routines`, `ai_routine_runs`, `ai_memory` e eventos/alertas internos estruturados, RLS por proprietário e organização ativa; nenhuma alteração de policy existente.
- Texto gera proposta de rotina com agenda estruturada e consultas readonly permitidas. Confirmar cria rotina; evento de sistema oferece Desfazer que desativa futuras ocorrências, preservando histórico.
- America/Sao_Paulo; dias úteis às 08h; deduplicação por rotina/ocorrência, lease, limite de recuperação e data relativa ancorada na ocorrência agendada.
- **Decisão confirmada por Leonardo:** executar com JWT de sessão ativa e recuperar pendências ao entrar, exibindo horário agendado e executado. Não há delegação Supabase existente para executar consultas sem sessão. Não armazenar JWT/refresh token, simular identidade ou ler negócio com service role. Execução offline real exige etapa específica de delegação.
- Rotinas executam leituras; não confirmam ações de negócio automaticamente. Alertas próprios somente no app: conflito de espaços, venda aberta desde criação (sem inferir última atividade) e clima quando a fonte existente permitir. Deduplicar e permitir marcar visto.
- Memória explícita/editável/desativável com controle de versão e mascaramento; não pode modificar permissões nem transformar conteúdo externo em instrução.
- Painel proposto `/admin/workers/uso`, protegido no servidor por admin da organização, somente agregados por usuário/bot. `ai_usage.cost_usd` hoje aceita apenas NULL e não há ledger de cobrança verificado: mostrar “Não informado”, completude e procedência, nunca custo zero inventado. Não expor conversas/memória de terceiros nem ampliar RLS de `ai_usage`.

## 4. UI e integração conjunta

Preservar marca Fenasoja, ícone próprio, nomenclatura Bots, tokens e CSS escopados, animação lazy e limite de mascotes. Componentes de action card, editor, validade, rotinas, execuções, eventos de sistema, memória e Precisa de você. Contratos compartilhados antes da implementação paralela; cliente nunca calcula autorização ou diff executável.

Mobile 390×844 e desktop 1280×800, claro/escuro; overflow a 360px. Estados reais de pendente/expirado/conflito/sem acesso, falhas de rede e troca de usuário/organização. Nenhum botão promete sucesso antes do receipt.

## 5. Validação e entrega

Typecheck, lint (separando dívida histórica), testes pertinentes, build e Deno. SQL: proprietário/organização, papéis admin/gestor/operador/leitura/comissão, capability revogada, edição/cancelamento/expiração e rollback após falha. Concorrência exige Postgres com duas conexões; PGlite serializado não prova esse critério. Rotinas: deduplicação, leases, dias úteis, fuso, execução atrasada, Desfazer, sessão expirada, memória/injeção, admin versus não admin e custo desconhecido. Regressões de Agenda/FCM/Google/public map. QA visual e acessibilidade com evidências, distinguindo fixtures locais de backend autenticado.

Relatório final com objetos criados, arquivos, evidências, riscos e limitações reais. PR nova no GitHub e vinculação ao chat; não publicar frontend. Se o Lovable solicitar uma aprovação técnica específica, apresentá-la ao Leonardo conforme o contrato do conector, sem contorná-la por outra API.

## Estado da transição para desenvolvimento

Leonardo rejeitou explicitamente a ação antiga `plan--show` (`{"path":".lovable/plan.md"}`). A decisão foi encaminhada pelo contrato HITL do conector e liberou a solicitação corrigida. A base foi verificada e as Fases 2 e 3 estão em implementação conjunta nesta branch. As duas migrations novas de ações/rotinas são parte da nova PR; não foram aplicadas ao ambiente remoto durante os testes locais.
