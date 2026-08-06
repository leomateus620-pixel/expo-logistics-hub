# Resumo da semana — notificação pessoal no cabeçalho do Cronograma

Componente compacto e clicável ao lado do título "Cronograma e Eventos", mostrando a semana do usuário autenticado.

## Estado inicial (colapsado)

Uma única pílula clicável, alinhada à direita da barra do módulo (desktop) e em linha própria abaixo do título (mobile):

```text
Semana atual · 3 eventos · 4h30
```

Na sexta-feira o texto muda para "Esta semana: 5 eventos · 8h de agenda" com destaque sutil (borda dourada).

Estados: carregando (skeleton do mesmo tamanho, sem alterar a altura do header), vazio ("Nenhum evento vinculado nesta semana."), erro ("Não foi possível atualizar seu resumo." + ação discreta "Tentar novamente").

## Estado expandido

Clique abre popover (desktop) / bottom sheet (mobile) com:

```text
Sua semana

5 eventos
8h de agenda · 4 dias com eventos

Segunda-feira
09:00 · Reunião da Comissão Central · 1h30

Quarta-feira
14:00 · Reunião de Infraestrutura · 2h

Sexta-feira
10:30 · Alinhamento institucional · duração não informada

Ver todos os eventos
```

Cada linha mostra dia, horário de início, título, duração e a comissão apenas quando existir. Clicar na linha abre o detalhe do evento já existente. "Ver todos os eventos" leva à Timeline filtrada pelo usuário e pela semana atual, preservando o contexto de navegação ao voltar.

## Regra de vínculo com o usuário

Um evento entra no resumo quando o usuário autenticado aparece como responsável relacional do evento (`cronograma_evento_responsaveis.org_member_user_id`), como responsável principal do registro, ou quando o nome do responsável textual corresponde ao nome de exibição do próprio usuário. Cada evento é contado uma única vez, mesmo com múltiplos vínculos.

Excluídos: eventos cancelados, sem data, fora da semana (segunda a sexta) e registros removidos. O sistema hoje não armazena resposta de convite (aceito/recusado) para eventos do cronograma; a função de elegibilidade já ficará preparada para descartar recusados assim que esse dado existir.

## Cálculo de duração

Soma de `start_time` → `end_time` de cada evento elegível, em horário de Brasília, usando os utilitários de fuso já existentes no projeto. Intervalos negativos são descartados; evento que cruza a meia-noite conta até o fim informado; evento sem hora final entra na contagem de eventos e é marcado como "duração não informada", nunca como 24h. Quando houver eventos sem duração, o colapsado mostra "4 eventos · 6h contabilizadas" e o expandido acrescenta "1 evento sem duração informada".

## Atualização

O resumo deriva dos dados já carregados/consultados do módulo, então acompanha automaticamente criação, edição, reagendamento, cancelamento e mudança de vínculos, sem alertas repetidos a cada abertura da página.

## Visual

Superfície discreta em navy com borda fina, número em destaque tipográfico, ícone de relógio/calendário refinado, acento dourado apenas no destaque de sexta-feira, hover e foco claros. Sem cards grandes, glows, ilustrações ou badges extras. Animações curtas, respeitando `prefers-reduced-motion`.

## Detalhes técnicos

- `src/lib/cronograma-weekly-summary.ts`: janela semanal centralizada (segunda–sexta, com flag para incluir fim de semana depois), regra de elegibilidade/deduplicação, cálculo de duração e agrupamento por dia.
- `src/hooks/useCronogramaWeeklySummary.ts`: consulta `cronograma_eventos_full` (campos `responsibles_rel`, `start_date`, `start_time`, `end_time`, `status`) via React Query, escopo do usuário autenticado e da organização atual, com `isLoading` / `isError` / `refetch`.
- `src/components/cronograma-eventos/WeeklySummaryPill.tsx` (colapsado) e `WeeklySummaryPanel.tsx` (conteúdo expandido), usando Popover no desktop e Drawer no mobile.
- Integração em `CronogramaModuleShell.tsx`, ao lado do título, com variante mobile em linha própria; estilos em um arquivo CSS dedicado do módulo.
- Navegação: "Ver todos os eventos" aplica os filtros existentes (`owner` + `fromDate`/`toDate`) na visão Timeline.
- Testes: elegibilidade (responsável, participante relacional, múltiplos vínculos, cancelado, sem hora final, cruzando meia-noite, transição de semana, usuário sem eventos), formatação de duração e render colapsado/expandido.
