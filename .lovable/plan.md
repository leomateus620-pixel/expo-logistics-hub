# Resumo da semana — bottom sheet mobile compacto

O componente colapsado no cabeçalho permanece com o cálculo e o comportamento atuais. O foco é reconstruir o estado expandido no celular como um bottom sheet enxuto, elegante e seguro contra recortes, além de um refino fino da pílula.

## Estado colapsado (refino leve)

- Mantém a estrutura: "RESUMO DA SEMANA" como rótulo secundário e "1 evento · 1h de agenda" como informação principal.
- Reforça o contraste do bloco numérico e reduz o peso de "Semana atual", sem competir com os números.
- Padding interno mais equilibrado, alinhamento vertical exato entre ícone, rótulo e valores, borda única e profundidade discreta.
- Estados: hover com elevação sutil, pressionado claro, foco de teclado visível, transições de 180–220ms.
- Sem "Ver resumo", sem badge, sem brilho excessivo.
- No mobile a pílula ocupa a largura disponível abaixo do título do módulo, com altura compacta e sem compressão de texto.

## Bottom sheet mobile (reconstrução)

- Altura limitada a `min(78dvh, ...)` com `max-height` seguro e `padding-bottom` com `env(safe-area-inset-bottom)`, para nunca ficar sob os controles do navegador.
- Estrutura em três faixas: cabeçalho fixo (alça + "Sua semana" + totais), lista rolável, rodapé fixo com "Ver todos os eventos".
- Só a lista rola; o corpo da página fica travado enquanto o sheet está aberto.
- Totais em uma linha compacta (eventos · duração · dias), com tipografia menor do que hoje e contraste forte sobre a superfície do sheet.
- Linhas de evento reorganizadas para o celular: horário em coluna fixa e alinhada, título em até duas linhas com quebra correta (sem reticências agressivas), duração alinhada à direita em texto discreto.
- Divisores finos entre dias, espaçamento reduzido, alvos de toque com pelo menos 44px de altura.
- Sem overflow horizontal; abertura e fechamento fluidos.

## Estado expandido no desktop

Permanece no popover atual, herdando o mesmo refino tipográfico e de divisores, sem virar dashboard nem repetir totais.

## Detalhes técnicos

- `src/styles/cronograma-weekly-summary.css`: refino da pílula e novo bloco de regras para o sheet (`--sheet`), com media query para o modo mobile e `dvh` + safe-area.
- `src/components/cronograma-eventos/WeeklySummaryPill.tsx`: separar o painel em cabeçalho/lista/rodapé para o `DrawerContent`, aplicar as classes do sheet e manter o mesmo `WeeklySummaryPanel` (variante `desktop` | `sheet`).
- Nenhuma mudança em `src/lib/cronograma-weekly-summary.ts` nem em `useCronogramaWeeklySummary` — cálculo e testes existentes intactos.
- Validação visual com Playwright em viewport mobile (390x844), tablet e desktop, mais a suíte `cronogramaWeeklySummary.test.ts`.
