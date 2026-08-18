# Correção dos seletores de vínculos e da barra de subeventos

Três problemas na Agenda FenaSoja: os seletores de "Comissão ou Assessoria responsável" e "Responsáveis do evento" ficaram com a lista de nomes espremida (às vezes só uma linha visível), a busca dentro deles parece não filtrar, e no workspace "Evento e subeventos" a barra do topo ultrapassa a largura da tela e se desloca na rolagem.

## O que muda

### 1. Espaço de visualização dos nomes

O painel do seletor (desktop) hoje se limita ao espaço livre abaixo do botão dentro do formulário rolável. Quando o campo está na parte de baixo da tela, sobra pouquíssima altura e a lista encolhe para o mínimo, deixando só um nome visível — exatamente o comportamento das fotos.

- O painel passa a ter uma altura mínima útil garantida (cerca de 8 nomes visíveis), reposicionando-se acima do botão quando não há espaço abaixo.
- A área de resultados ganha um piso de altura próprio, para nunca ser comprimida pelo cabeçalho de busca, pela barra de atalhos e pelo rodapé "Concluir".
- O rodapé com "Concluir" continua sempre visível e fixo, sem roubar espaço da lista.
- No celular, a folha inferior segue ocupando a altura disponível, com a lista sempre como área principal de rolagem.

### 2. Busca voltando a filtrar

A busca será corrigida para filtrar de forma previsível por nome, função/cargo e comissão, ignorando acentos e maiúsculas, com o contador de resultados refletindo o filtro aplicado, e a lista rolando de volta ao topo a cada nova busca. Os grupos ("Membros do sistema", "Responsáveis institucionais") só aparecem quando têm resultados.

Observação honesta: a lógica de filtragem no código está aparentemente correta, então a primeira etapa é reproduzir o caso real no navegador para identificar a causa exata (foco/entrada de texto sendo bloqueada dentro do formulário, ou apenas a lista comprimida dando impressão de "não achou"). A correção é aplicada conforme o que a reprodução mostrar, junto com os ajustes de altura acima.

### 3. Barra do menu "Evento e subeventos"

- A barra deixa de ultrapassar os limites da tela: respeita a largura do conteúdo e as margens laterais em qualquer resolução.
- Fica realmente fixa no topo durante a rolagem, sem descer nem sobrepor os cards de responsáveis e comissões, mantendo o botão "Voltar ao cronograma", o título e o resumo de subeventos legíveis também em telas estreitas.

## Detalhes técnicos

- `src/styles/cronograma-registration-interactions.css`
  - `.cronograma-relation-popover`: trocar `max-height: min(34rem, var(--radix-popover-content-available-height, 34rem))` por uma fórmula com piso (`min(34rem, max(24rem, var(--radix-popover-content-available-height, 34rem)))`), mantendo `overflow: hidden` e layout em coluna.
  - `.cronograma-relation-results`: elevar `min-height` de `6rem` para ~`16rem` (desktop) com `flex: 1 1 auto`, preservando `overscroll-behavior: contain`.
  - Manter `.cronograma-relation-popover__footer` como `flex: 0 0 auto` sticky; revisar a folha mobile (`.cronograma-relation-sheet`) para elevar `min-height` e garantir a lista como único bloco flexível.
- `src/components/cronograma-eventos/RelationalMultiSelect.tsx`
  - `PopoverContent`: adicionar `avoidCollisions`, `sticky="always"` e permitir flip para cima (`side="bottom"` com colisão), de modo que o painel escolha o lado com mais espaço.
  - Ao alterar `search`, resetar `scrollTop` da lista e `activeIndex`; garantir que o input não perca foco em re-render (chave estável) e que nenhum handler de tecla do formulário/diálogo intercepte a digitação.
  - Ocultar grupos vazios em `groupedOptions` e manter o resumo de resultados vinculado a `matchingOptions`.
- `src/styles/cronograma-workspace.css`
  - `.cronograma-workspace-toolbar`: garantir contenção horizontal (`width: 100%`, `max-width: 100%`, `overflow-x: clip`) e `position: sticky; top: 0` relativo ao contêiner do workspace, eliminando o deslocamento de `68px` que a faz flutuar sobre o conteúdo.
  - `.cronograma-workspace-toolbar-inner`: colunas flexíveis com `minmax(0, …)` para não estourar a largura; em telas estreitas, empilhar/reduzir o resumo em vez de transbordar.
- Verificação no navegador (Playwright) do formulário de evento e do workspace de subeventos, em desktop (1280) e mobile (393), confirmando: busca filtrando, ao menos 6–8 nomes visíveis, "Concluir" acessível e barra fixa sem overflow.
