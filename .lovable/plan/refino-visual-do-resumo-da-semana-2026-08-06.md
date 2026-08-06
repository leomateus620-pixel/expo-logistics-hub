# Refino visual do "Resumo da semana"

Ajuste de acabamento no componente do cabeçalho de "Cronograma e Eventos". Nenhuma mudança no cálculo personalizado, na regra de vínculo ou no comportamento de expansão.

## Estado colapsado

- "RESUMO DA SEMANA" permanece como rótulo secundário: caixa alta, letra pequena, peso médio, cor azul acinzentada discreta.
- A linha principal ganha destaque: "Semana atual" fica secundária (peso normal, cor atenuada) e "1 evento · 1h de agenda" recebe peso forte, tamanho maior e alto contraste, com números em tabular-nums para não "dançar" ao atualizar.
- Separadores "·" com opacidade reduzida, para o olho ir direto ao número.
- Ícone de relógio/calendário refinado em placa quadrada de canto suave, alinhado opticamente ao centro do bloco de texto.
- Chevron discreto à direita indicando que o componente abre; sem texto "Ver resumo".
- Superfície: uma única borda fina, raio consistente com o header, profundidade sutil (leve luz interna no topo), sem gradiente forte, sem glow, sem sombra grande, sem cara de badge de notificação.
- Padding interno reequilibrado e espaçamento consistente entre ícone, rótulo e valores; altura do header preservada.

## Interação

- Todo o componente continua clicável; nenhum botão aninhado novo.
- Hover: elevação sutil e borda com acento institucional contido.
- Pressionado: leve recuo, sem salto de layout.
- Foco por teclado visível (anel dourado com offset).
- Transições de 200ms; respeitando `prefers-reduced-motion`.

## Organização do cabeçalho

- Separação clara entre o resumo e "Sair": aumenta o espaçamento entre eles e insere um divisor vertical fino, para não parecerem o mesmo grupo de controle.
- O resumo fica ancorado ao bloco de identidade do módulo; "Sair" permanece como ação independente à direita.
- Desktop/notebook: compacto, alinhado horizontalmente, sem crescer a altura da barra; título do módulo continua dominante.
- Tablet: mesma pílula compacta, com o rótulo secundário podendo recolher se faltar espaço.
- Mobile: linha própria abaixo do título, largura total aproveitada, altura compacta, alvo de toque confortável, sem quebra ou overflow horizontal (o valor trunca com reticências apenas em último caso).

## Estado expandido

Conteúdo idêntico ao atual (total de eventos, duração total, lista cronológica com dia, horário, título e duração). Apenas acabamento: hierarquia tipográfica mais clara nos totais, divisores leves entre dias, linhas com respiro maior e alinhamento de horário em coluna fixa. Sem gráficos, indicadores extras ou totais repetidos.

## Detalhes técnicos

- `src/styles/cronograma-weekly-summary.css`: reescrita das regras de `.cronograma-week-pill*` (padding, borda única, raio, profundidade, tipografia, hover/active/focus, variante mobile) e refinamento de `.cronograma-week-panel*` / `.cronograma-week-row*` (divisores e espaçamento).
- `src/components/cronograma-eventos/WeeklySummaryPill.tsx`: separar o rótulo do período ("Semana atual"/"Esta semana") dos valores ("1 evento · 1h de agenda") em spans próprios para permitir a nova hierarquia, adicionar o chevron e manter os estados de carregando/erro com a mesma altura. A montagem do texto continua vindo de `buildCollapsedLabel`, apenas exposta em partes.
- `src/lib/cronograma-weekly-summary.ts`: acrescentar um helper que devolve as partes do rótulo (prefixo e resumo) reutilizando a lógica existente; `buildCollapsedLabel` continua disponível para o `aria-label`.
- `src/components/cronograma-eventos/CronogramaModuleShell.tsx`: ajuste de espaçamento e divisor entre o resumo e o botão "Sair", e do bloco mobile abaixo do título.
- Validação visual em desktop, notebook, tablet e mobile nos estados colapsado e expandido.
