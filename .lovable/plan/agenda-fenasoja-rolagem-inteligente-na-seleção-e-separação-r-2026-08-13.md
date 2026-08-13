# Agenda Fenasoja: rolagem inteligente na seleção e separação Responsável / Convidados

## 1. Rolagem com o mouse sobre os cards da lista

Hoje a lista de opções (`Comissão ou Assessoria responsável` e `Responsáveis do evento`) só rola pela barra lateral. Cada card da lista reage ao movimento do mouse (`onMouseMove`) marcando o item como ativo, o que dispara re-render a cada micro-movimento durante a rolagem e atrapalha o comportamento. A causa exata do bloqueio da roda do mouse ainda não está confirmada, então a primeira etapa é reproduzir no preview (desktop) e confirmar se o evento de roda está sendo consumido pelo popover/dialog ou perdido no re-render.

Correções previstas:
- Encaminhar a roda do mouse para o contêiner rolável quando o ponteiro estiver sobre qualquer card, garantindo rolagem em toda a área da lista (não só na barra).
- Trocar o realce por `onMouseMove` (que dispara em cada pixel) por realce baseado em posição do ponteiro com throttle, sem re-render por movimento — mantendo o mesmo destaque azul do item sob o cursor.
- Durante a rolagem, o card sob o cursor continua sendo destacado em azul (mesmo padrão visual já existente `data-active`), com transição suave; o realce por teclado permanece funcionando.
- Rolagem suave com inércia preservada, `overscroll-behavior: contain` mantido para não rolar a página atrás, e rolagem por toque intacta no mobile.

## 2. Primeiro responsável = Responsável; demais = Convidados

Regra nova em todo o módulo: o vínculo marcado como principal (ou, na ausência, o primeiro da lista) é o **Responsável**; todos os outros passam a ser exibidos como **Convidados**. É só mudança de rótulo e agrupamento na exibição — nenhuma alteração de banco ou de gravação.

Onde reflete:
- **Formulário (Responsáveis do evento)**: o cartão principal recebe o selo "Responsável"; os demais recebem o selo "Convidado", com botão "Definir como responsável" no lugar de "Definir como principal".
- **Cards da visualização principal (timeline/listas)**: passam a mostrar o responsável em destaque e, ao lado, os convidados (nomes com contagem, ex.: "+2 convidados" quando não couber), com hierarquia tipográfica clara.
- **Visualização expandida (drawer de detalhes)**: bloco atual de responsáveis dividido em dois — "Responsável" (um card em destaque) e "Convidados" (lista compacta, com contador e recolher quando houver muitos).
- Fallback preservado: eventos antigos sem vínculos relacionais continuam mostrando o nome legado como Responsável.

## 3. Arquivos tocados

- `src/components/cronograma-eventos/RelationalMultiSelect.tsx` — rolagem/realce e rótulos Responsável/Convidado.
- `src/styles/cronograma-registration-interactions.css` — estilos do realce durante a rolagem e dos selos.
- `src/components/cronograma-eventos/EventRelationFields.tsx` — separar itens em responsável + convidados.
- `src/components/cronograma-eventos/EventDrawer.tsx` — blocos separados na visão expandida.
- `src/components/cronograma-eventos/EventCards.tsx` — exibição de responsável e convidados no card.
- `src/index.css` — ajustes visuais dos blocos de relação.

## 4. Validação

- Typecheck limpo.
- Playwright autenticado no desktop: abrir "Novo evento", rolar as duas listas com a roda do mouse sobre os cards, confirmar realce azul acompanhando o cursor e ausência de travamento; capturar screenshots.
- Conferir um evento com 3 responsáveis: selo "Responsável" no principal e "Convidado" nos demais, refletido no card da timeline e no drawer expandido.
