# Agenda FenaSoja — refatoração exclusiva da experiência mobile

Objetivo: a Timeline aparece logo abaixo de uma faixa de controles compacta. Tudo que hoje ocupa altura fixa vira ícone/pílula expansível. Nenhuma funcionalidade é removida e o desktop não muda.

## Nova ordem vertical no celular

```text
[ ‹  ícone Agenda  🔍  |  10%  Google  ⎋ ]      faixa 1 (comando)
[ Resumo da semana · 3 eventos · 5h      ⌄ ]    pílula fina
[ ⧉ Linha do tempo ▾ ] [ 26 · 2026 ▾ ] [ ⚙ 2 ]  faixa de controles
[ ‹  Agosto de 2026 · Mês atual  › ]            cabeçalho do mês
[ primeiro evento ]                             visível sem rolar
```

## 1. Busca vira ícone

- A linha inteira com o campo de busca sai do bloco mobile do cabeçalho.
- Entra um botão de lupa na primeira linha, ao lado do ladrilho laranja da Agenda.
- Ao tocar, o campo se expande sobre a própria linha (os demais botões colapsam para ícones), com animação de ~180ms; fecha por X, Esc ou toque fora, limpando ou preservando o termo conforme o botão usado.
- Quando há termo ativo com a busca fechada, a lupa recebe um ponto dourado.
- A lógica de pesquisa (contexto atual, debounce 220ms) permanece intacta.

## 2. Resumo da semana compacto

- Mantém texto, contagem de eventos, horas e a expansão em bottom sheet.
- Versão mobile em linha única, altura ~40px, ícone menor, rótulo "RESUMO DA SEMANA" reduzido a um traço secundário e o valor principal em destaque: `Semana atual · 3 eventos · 5h`.

## 3. Navegação em um único seletor

- A barra horizontal e o drawer lateral atual saem do fluxo mobile.
- Novo controle: ícone da visão + nome + chevron. Ao tocar, abre um popover curto e ancorado (não drawer de tela cheia) com Linha do tempo, Dashboard, Pendências, Calendário, Histórico concluído.
- Seleção fecha o popover, atualiza ícone/nome e navega.
- "Novo evento" continua acessível: passa a ser um botão dourado dentro do próprio popover, no topo da lista.
- Correção de contraste: superfície sólida navy (sem translucidez alta), texto claro nítido, item ativo com barra dourada e fundo cheio — o efeito esbranquiçado/apagado do anexo desaparece.

## 4. Ciclo 2026/2027/2028 compacto

- A régua horizontal de anos sai do mobile.
- Vira uma pílula `2026 ▾` ao lado do seletor de visão; ao abrir, lista os três anos com etapa e contagem (`2026 — 47/104`).
- Troca de ano com transição curta e atualização imediata da Timeline; azul/ouro/laranja usados apenas no item selecionado.

## 5. Filtros como ação

- O card de filtros desaparece; sobra um botão compacto com ícone e, quando houver filtros ativos, um badge numérico dourado.
- Abre um sheet compacto (altura limitada, respeitando a safe area) com filtros ativos como chips removíveis, seleção, "Limpar tudo" e rodapé fixo com "Aplicar".
- A contagem `138 de 138 eventos` passa para uma linha discreta acima da lista, sem card próprio.

## 6. Cabeçalho do mês em uma linha

- `‹ Agosto de 2026 [Mês atual] ›` em composição horizontal única; "Estruturação" vira um rótulo pequeno em caixa alta ao lado do ano, sem caixa própria.
- Remoção do bloco amarelo de "Mês atual" em linha separada; vira chip inline.

## 7. Cards de evento

- Coluna de data fixa e alinhada (dia grande, mês, hora abaixo em tom secundário), título em até três linhas com quebra correta, avatares menores, status e prioridade em uma única linha de chips.
- Evento de hoje/próximo com borda esquerda dourada e leve elevação, sem exagero.
- Altura mínima de toque de 44px, sem linhas apertadas.

## 8. Linguagem visual e responsividade

- Navy sólido nas superfícies de comando, ouro e laranja apenas em estados ativos, fundo claro na área da Timeline, bordas de 1px e sombras curtas.
- Regra global de `overflow-x: clip` nos contêineres mobile e larguras em `min-w-0`; validação em 360/375/390/393/430px, portrait e landscape.
- Apenas uma expansão aberta por vez: abrir busca, navegação, ciclo, filtros ou resumo fecha as demais.

## Detalhes técnicos

- `src/components/cronograma-eventos/CronogramaModuleShell.tsx`: novo bloco mobile com lupa expansível; remove o campo de busca em largura total.
- Novos componentes: `mobile/MobileSearchToggle.tsx`, `mobile/MobileViewSwitcher.tsx`, `mobile/MobileCycleSwitcher.tsx` e um contexto leve `mobile/MobileOverlayCoordinator.tsx` garantindo exclusividade mútua entre as expansões.
- `MobileCronogramaNavDrawer.tsx` é substituído pelo switcher em popover (arquivo removido após a migração das opções e do botão "Novo evento").
- `MobileCronogramaFilters.tsx`: reduzido ao gatilho compacto + sheet; reaproveita o estado de filtros já existente em `CronogramaEventosPage.tsx`.
- `CronogramaTimelineBoard.tsx` e `MobileCronogramaTimeline.tsx`: cabeçalho do mês em linha única no mobile e refino dos cards.
- `WeeklySummaryPill.tsx`: variante mobile mais baixa, sem alterar `useCronogramaWeeklySummary` nem os cálculos.
- Estilos concentrados em `src/styles/cronograma-mobile.css` (com ajustes pontuais em `cronograma-command-layer.css`), todos sob media query mobile para não afetar o desktop.
- Validação com Playwright em 360, 390 e 430px (portrait e landscape), percorrendo busca, troca de visão, troca de ano, filtros, mês, abertura de evento e fechamento de overlays, mais a suíte de testes existente.
