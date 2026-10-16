# Equipe Fenasoja — Etapa 1: saúde do banco (bloqueante)

Seguindo o roteiro em etapas: esta é só a Etapa 1. Ao final, relatório e PARE. Etapas 2–7 (roteador, síntese, busca web, memória/rotinas, MCP/custo, Estúdio) terão planos próprios.

## Situação confirmada
- Os arquivos `20261016130000_workers_confirmed_actions.sql` e `20261016130100_workers_routines_memory.sql` existem no projeto, mas não foram aplicados ao banco (as últimas aplicadas são 0007, 0008 e 0009).
- A leitura da memória do bot (`workspace-planner.ts`, `memory()`) lança erro 503 quando a tabela não existe. Isso derruba o turno inteiro, o que explica de forma plausível os `turn_failed` de 14:31.

## O que será feito
1. **Proteger a conversa já** (independe da aplicação):
   - `memory()` devolve lista vazia quando a tabela não existe ou dá erro de leitura, e registra o motivo na auditoria do turno. Bug corrigido junto: o filtro por bot passa a ser aplicado antes do limite, e a ordem fica por data mais recente.
   - As funções de ações e rotinas respondem `feature_unavailable` (com a mensagem amigável em PT-BR) em vez de 5xx quando as tabelas faltam. As propostas de ação ou rotina no chat também viram um aviso curto.
   - Nova checagem somente leitura `workers_schema_ready()`, que só lista quais objetos da etapa 2/3 existem. A interface a consulta e esconde ações e rotinas enquanto não estiverem prontas.
2. **Aplicar as duas migrations pendentes**: com o SQL idêntico ao do arquivo, só depois do seu "sim" explícito neste plano. Antes conferimos assinaturas, dependências e a ordem dos grants. Se houver divergência das regras (por exemplo uma ligação com a tabela de usuários), paro e relato sem reescrever.
3. **Implantar** `workers-orchestrator`, `workers-actions` e `workers-routines` (este último sem agendamento automático), mantendo login obrigatório.

## Verificação
- Reproduzir o turno com e sem as tabelas novas: a conversa responde nos dois casos.
- Testes automatizados: memória ausente → `[]`; filtro por bot antes do limite; ações/rotinas indisponíveis → `feature_unavailable`.
- Conferir só a estrutura do banco: tabelas, RLS, permissões, chamada sem login → 401. Nenhum dado de negócio lido ou criado, nada publicado.

## Decisão necessária
Aprovar este plano autoriza o passo 2 (aplicar as migrations de ações confirmadas, rotinas e memória, que incluem funções de gravação via cartão de confirmação). Se preferir só a proteção (passo 1) por enquanto, diga ao rejeitar.

## Detalhes técnicos
- Detectar tabela ausente pelo código `42P01` / `PGRST205` no erro.
- `workers_schema_ready`: SECURITY DEFINER STABLE, retorna jsonb de `to_regclass` para `ai_actions`, `ai_action_events`, `ai_routines`, `ai_routine_runs`, `ai_memory`; GRANT EXECUTE a `authenticated`.
- `useWorkerWorkspace` usa a checagem para ocultar painéis.
