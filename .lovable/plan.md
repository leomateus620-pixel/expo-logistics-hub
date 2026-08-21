# Eventos de planilha: exclusivos de Cléo e Zélia

## Estado atual (confirmado no banco)

- `cronograma_eventos` guarda a origem em `source_sheet`. Os três cronogramas anuais importados somam **116 eventos**: 2026 (40), 2027 (48), 2028 (28).
- Esses mesmos eventos estão embutidos no catálogo oficial do app (`fenasoja2028CronogramaSeed`). Hoje, se forem apagados ou ficarem invisíveis, o app **recria automaticamente** (auto-seed em `useCronogramaEventos`).
- No Google Agenda eles já foram espelhados para 5 pessoas: Fabiano Soltis (92), Djeison Drey (92), Fernanda Secklereich (64), Leonardo Stroschein (64) e Cléo (64).
- A elegibilidade do Google (`google_user_eligible_for_event`) hoje libera tudo para quem tem acesso total, e a RLS de `cronograma_eventos` libera tudo para admin/gestor/operador.
- Existem contas duplicadas de Cléo e Zélia (uma antiga com papel "leitura"). Conforme definido, só as contas **gestor** ficam com acesso.

## Decisões aplicadas

- Escopo: apenas os 3 cronogramas anuais (.xls 2026/2027/2028) — 116 eventos.
- Ninguém além de Cléo e Zélia (contas gestor) vê esses eventos, nem mesmo administradores.
- Vale para sistema, Google Agenda e para qualquer recriação futura a partir do catálogo do app.

## Implementação

### 1. Marcação de origem restrita (migration)
- Nova coluna `planning_restricted boolean not null default false` em `cronograma_eventos`, marcada como `true` nos 116 eventos dos três arquivos anuais.
- Trigger de normalização: todo evento cujo `source_sheet` seja um dos três cronogramas anuais nasce já restrito (protege importações/reinserções futuras).
- Nova tabela `cronograma_planning_viewers` (`org_id`, `user_id`) com GRANT + RLS de leitura, semeada com Cléo (gestor) e Zélia (gestor), e função `cronograma_can_view_planning(_user_id, _org_id)`.

### 2. Visibilidade no sistema (RLS)
- Políticas `select`, `update` e `delete` de `cronograma_eventos` passam a exigir: `planning_restricted = false` **ou** o usuário estar na lista de planejamento. Mesma regra propagada às tabelas filhas (responsáveis, comissões, subeventos e anexos) para não vazar por relações.
- Capability `cronograma_planning_access` concedida às duas contas, para o front saber quem enxerga.

### 3. Google Agenda
- `google_user_eligible_for_event` passa a retornar falso para evento restrito quando o usuário não é viewer de planejamento — vale para escopo `all` e `mine`.
- Limpeza: enfileirar operação `delete` em `google_sync_outbox` para cada mapeamento existente desses eventos pertencente a Soltis, Djeison, Fernanda e Leonardo (Cléo permanece), rodar o `google-sync-worker` em lotes até drenar a fila e conferir que `google_calendar_event_map` ficou só com os viewers.
- Zélia, ao conectar, recebe os eventos de planejamento normalmente (sua política `mine` continua valendo para os demais eventos).

### 4. Front-end (fim do re-seed)
- Em `useCronogramaEventos.ts`, o catálogo local passa a ser filtrado: eventos cujo `sourceSheet` seja um dos três cronogramas anuais só entram no merge e no auto-seed quando o usuário tem a capability `cronograma_planning_access`. Sem isso, eles não aparecem na timeline nem são recriados no banco.
- Nenhuma mudança de layout: a timeline, o dashboard e o resumo semanal simplesmente deixam de contar esses eventos para quem não é viewer.

### 5. Testes e validação
- Testes unitários do filtro do catálogo (viewer vs. não-viewer) e da ausência de auto-seed para não-viewer.
- Consultas SQL de verificação: contagem de eventos restritos, checagem de `google_calendar_event_map` sem usuários fora da lista, e simulação da RLS/elegibilidade por usuário (Soltis, Djeison, Fernanda, Leonardo, Cléo, Zélia).
- Verificação no preview com sessão real: a timeline de um usuário comum não mostra os eventos de planilha em 2026, 2027 e 2028.

## Detalhes técnicos

- Tabelas: `cronograma_eventos` (+`planning_restricted`), nova `cronograma_planning_viewers`, `user_capabilities` (nova capability).
- Funções: `cronograma_can_view_planning` (nova), `google_user_eligible_for_event` (reescrita), trigger de marcação por `source_sheet`.
- Edge functions: `google-sync-worker` executado apenas na etapa de limpeza; nenhuma alteração de código nas funções.
- Arquivos: `src/hooks/useCronogramaEventos.ts` e um novo teste em `src/test/`.
- Reversível: basta remover a marcação/capability para o comportamento antigo voltar.
