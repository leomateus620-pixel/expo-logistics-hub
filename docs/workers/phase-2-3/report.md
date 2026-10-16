# Bots Fenasoja — Fases 2 e 3

16/10/2026 · America/Sao_Paulo. Base de revisão: `7ea29660` (PRs #203 e #204 integradas). O planejamento foi aprovado por Leonardo antes da implementação conjunta.

## Resultado

A base de leitura foi ativada no Lovable Fenasoja: migrations 0007/0008 aplicadas e somente `workers-orchestrator` implantada, com JWT obrigatório. A verificação independente obteve POST sem autenticação **401** e OPTIONS **204**. As quatro tabelas AI, grants, RLS, policies e assinaturas foram conferidos; a auditoria existente também confirmou RLS nas 20 tabelas de negócio consultadas. [Evidências da ativação](activation-status.json), [auditoria implantada](deployed-rls-audit.json) e [empacotamento canônico](edge-registry-packaging.md).

Esta PR acrescenta ações confirmadas, rotinas de consulta, memória própria, caixa de atenção e uso agregado administrativo. **As duas migrations novas e as novas funções desta PR ainda não foram aplicadas ao ambiente remoto. O frontend não foi publicado.** Nenhuma outra função implantada foi alterada.

## Comportamento entregue

O chat anuncia propostas somente quando a mensagem humana atual pede uma das operações habilitadas. Anexo, web, memória e histórico são dados não confiáveis e não habilitam ferramentas de proposta. O modelo nunca recebe uma ferramenta de confirmar, payload comercial privado ou SQL. A resposta factual continua construída a partir de evidências verificadas, com links validados.

- **Arena:** nova nota operacional. O card mostra o texto exato autorizado; edição muda a versão e exige revisão. A RPC nativa é chamada com `note_id=NULL`.
- **Mapa:** reserva ou início de negociação apenas para lote persistido `AVAILABLE`, sem operações, venda ou contrato ativos. Empresa/contato/prazo são preenchidos em formulário separado, sem histórico de chat, modelo ou SSE. Documento, telefone, e-mail, preço e notas comerciais são NULL na chamada nativa.
- **Confirmação:** ID e versão, na organização atual. Card, grants e recurso são bloqueados; snapshot, acesso e prazo são revalidados. Efeito, receipt e auditoria são transacionais. Repetição retorna o mesmo receipt. Edição invalida a versão; cancelamento e expiração mantêm auditoria. Não há Desfazer para essas três operações.
- **Rotinas:** três receitas determinísticas — agenda/conflitos do Restaurante, vendas com assinatura pendente pela idade desde a criação e snapshots climáticos críticos ainda válidos. Texto gera proposta; confirmar cria evento com Desfazer para futuras ocorrências. Pausar, retomar e desativar preservam histórico.
- **Sessão:** app aberto e visível, JWT atual. Ao entrar, recupera somente a ocorrência mais recente do mesmo dia, com horário agendado e executado separados. O banco calcula dias ISO e America/Sao_Paulo; lease/fence e deduplicação evitam duas execuções concorrentes. Não há credenciais armazenadas nem execução offline delegada.
- **Memória/atenção:** preferências explícitas editáveis/desativáveis; alertas próprios somente in-app; propostas pendentes e avisos em “Precisa de você”.
- **Uso:** `/admin/workers/uso`, somente admin da organização no cliente e no servidor. Tokens e completude agregados; custo **Não informado** e limite **Não configurado**. Telemetria `user_scoped` é identificada e não é uma fatura atestada.

Agenda, checklist, criação de eventos/tarefas, operações financeiras, exclusões, confirmação/cancelamento/revisão de vendas e mensagens a terceiros continuam fora das ferramentas executáveis. Seus triggers não foram alterados.

## Arquivos e objetos

O [manifesto de arquivos](changed-files.txt) lista todos os caminhos desta entrega. Principais grupos:

| Grupo | Arquivos/objetos |
|---|---|
| Contrato compartilhado | `_shared/workers/workspace-contracts.ts`; reexport e cliente validado em `src/features/workers/workspace-*.ts` |
| Propostas e orquestrador | `proposal-policy.ts`, `workspace-planner.ts`, `action-tools.ts`, `engine.ts`, `contracts.ts`, `provider.ts`, `workers-orchestrator/index.ts` |
| Ações | `workers-actions/**`, helpers `workspace-http.ts`; migration `20261016130000_workers_confirmed_actions.sql` |
| Rotinas | `workers-routines/**`, `routines.ts`; migration `20261016130100_workers_routines_memory.sql` |
| Interface | `workspace/WorkspaceActionCard.tsx`, `WorkspacePanels.tsx`, `useWorkerWorkspace.ts`, `WorkersUsagePage.tsx`, `WorkersChat.tsx`, hook/API SSE e `styles/workspace.css` |
| Integração | runner lazy `WorkersSessionRunner.tsx`, `WorkersLauncher.tsx`, rota admin em `App.tsx`, catálogo/perfis; `MapLotDeepLink.tsx` só resolve lote autorizado usando seleção existente |
| Qualidade | testes Vitest/Deno, fixtures e runners PostgreSQL/visual, workflow `.github/workflows/fenasoja-bots.yml` |

Novas tabelas públicas: `ai_actions`, `ai_action_events`, `ai_routines`, `ai_routine_runs`, `ai_memory`, `ai_system_events`, `ai_inbox_items` e `ai_workspace_receipts` (sem acesso direto do cliente). Tabelas privadas: `workers_private.ai_action_payloads` e `ai_action_requests`. Não há FK para `auth.users`. Grants precedem ENABLE RLS/policies, sem alterar policies de negócio existentes. As RPCs novas são enumeradas nas migrations e nos [detalhes de ações](actions-implementation.md).

A leitura canônica em `src/lib/workers` e o artefato Edge continuam sincronizados (`--check`). O bundle MCP gerado, geometria, câmera, preços, linhagem, snapshots e renderização da cena não foram editados. O novo parâmetro `lote=UUID` usa somente o lote já carregado e a navegação existente; sem parâmetro não produz efeito. CSS novo é escopado; tokens globais permanecem iguais.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck global e build Vite | PASS; build local, sem publicação |
| Registry Edge canônico `--check` | PASS |
| Vitest específico + regressões existentes | 284 testes / 21 arquivos PASS na rodada final |
| Deno | checks das Edge Functions PASS; 11 testes HTTP/dispatch/erros de ações PASS |
| PostgreSQL 16.14 — ações | **24 grupos PASS**, duas conexões reais, RPCs nativas extraídas sem alteração |
| PostgreSQL 16.14 — rotinas | **23 grupos PASS**, concorrência, CAS, leases/fences e recuperação |
| Lint do escopo alterado | PASS, sem diagnósticos |
| Lint completo | 1.017 erros / 74 warnings, iguais ao controle `7ea29660` |
| Vitest completo | 49 arquivos com falha / 370 aprovados; 88 falhas / 3.405 aprovados. Controle main: mesmas 88 falhas em 49 arquivos, sem cenário adicionado/removido |
| Visual | 55 capturas + oito recapturas finais; axe/overflow sem violações; 10 fluxos aprovados; 390×844 e 1280×800 claro/escuro e overflow a 360px |
| Telas existentes | 16 pares de entrada/login comparados: 12 imagens byte a byte idênticas; quatro diferem só em 12 pixels de borda antialias, no máximo 1/255 por canal. Layout e texto iguais nos 16 pares |

[Comparação da suíte completa](full-suite-comparison.json), [ações no banco](actions-validation.json), [rotinas no banco](routines-validation.json), [QA visual](design-qa.md) e [telas existentes](existing-pages-qa.json). Os testes de regressão incluem Agenda, public map, push e Google Calendar; não representam envio FCM ou sincronização com conta Google reais. O [workflow dedicado](../../../.github/workflows/fenasoja-bots.yml) repete os checks específicos e PostgreSQL em CI, sem secrets de produção.

### Papéis e fronteiras comprovadas

| Contexto | Resultado verificado |
|---|---|
| Admin/gestor | Notas segundo as permissões nativas; nenhum papel recebe operação proibida |
| Operador/leitura sem grants | Sem confirmação de nota/operação comercial; recusa no banco, inclusive via RPC direta |
| Membro restrito com/sem capabilities | Gates explícitos de Venue/Mapa; revogação durante espera bloqueia execução e leitura do card |
| Outra pessoa/organização/inativo | RLS própria e RPCs recusam acesso/confirmar/editar/rotinas/memória |
| `financial_access` | Não habilita escrita financeira nem painel administrativo; ferramentas financeiras de leitura mantêm o gate existente |
| Uso administrativo | Gestor, operador e leitura recusados; admin só consulta agregados da organização |
| SQL direto com NULL/extra keys | Rejeita CAS/fence nulos, recibo forjado, RPC livre, fields/capabilities fornecidos pelo cliente |

As fixtures de negócio são sintéticas; a migration AI é real e os testes de ações usam os corpos das três RPCs nativas. Não se alega simulação integral das policies de negócio do Supabase implantado. Nenhum registro de negócio real foi criado para QA.

## Limites e operação

- Briefing às 08h depende de sessão ativa e visível; a entrada posterior recupera a ocorrência do dia. Horários agendado/executado e recuperação ficam explícitos.
- Consultas limitadas a 100 registros declaram amostragem quando truncadas. O alerta de Restaurante não fornece uma junção por ID de comissão; a resposta informa que o alerta geral não é interseção comprovada com os eventos da comissão. Idade de venda usa criação, sem inferir inatividade/receita.
- Memória e resultados de rotinas são próprios e `user_scoped`; não são comprovação independente de cobrança ou de execução por um cliente oficial. Histórico rico permanece em `ai_messages` com referências de request, enquanto runs/alertas guardam metadados.
- Mascaramento reconhece formatos, não toda informação pessoal em linguagem natural. Notas devem permanecer operacionais, pois a RPC nativa audita o corpo. Dados privados de proposta são limpos em estado terminal ou expiração observada; não existe purga privilegiada de cards nunca revisitados.
- Evento de espaço sem alocação reconhecida usa a rota base com ID; sua abertura depende do comportamento existente. As demais referências de ações abrem o registro persistido correspondente.
- QA visual usa identidade/dados sintéticos em localhost. A comparação de telas existentes cobre entrada/login sem sessão; não constitui validação visual autenticada de negócio ou benchmark em celular físico.
- Antes de habilitar esta PR no ambiente remoto, aplicar somente as duas migrations novas em ordem, implantar `workers-actions`, `workers-routines` e atualizar `workers-orchestrator` com as dependências locais, mantendo JWT obrigatório. Não reaplicar 0007/0008. A publicação do frontend permanece separada.

## Reprodução local/CI

```sh
npm run typecheck
node scripts/workers/build-edge-registry.mjs --check
npx vitest run src/features/workers src/lib/workers src/test/workersOrchestrator.test.ts src/test/workersProposals.test.ts src/test/workersRoutines.test.ts src/test/mapLotDeepLink.test.tsx
node scripts/workers/actions-qa.mjs --pg-module /caminho/absoluto/node_modules/pg/lib/index.js
node scripts/workers/routines-db-qa.mjs --pg-module /caminho/absoluto/node_modules/pg/lib/index.js
deno test --allow-env --config supabase/functions/workers-actions/deno.json supabase/functions/workers-actions/actions_test.ts
npm run build
```

PostgreSQL isolado em loopback, bancos descartáveis `actions_phase23`/`routines_phase23`; runners aceitam `WORKERS_QA_PG_USER`/`WORKERS_QA_PG_PORT`. Eles recriam schemas apenas nesses bancos. Não usam `.env` nem credenciais do projeto. Para preview/QA usar `scripts/workers/preview.vite.config.ts` e `visual-workspace-qa.mjs`; nunca publicar esse harness. Os logs locais ficam em `/tmp/fenasoja-bots-phase23-*`.
