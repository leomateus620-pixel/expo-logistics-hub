# Redesenho do seletor de workspaces do módulo Restaurante e Arena

Redesenhar o cabeçalho do módulo "Eventos Restaurante e Arena" para que o seletor de ambientes ocupe a largura total com duas metades bem delimitadas, removendo ações e metadados que poluem a leitura.

## 1. Estrutura do seletor: duas metades da tela

- O `VenueWorkspaceSwitcher` passa a ser um container de largura total (`width: 100%`) com `display: grid` e `grid-template-columns: 1fr 1fr`.
- Cada opção (`restaurante` / `arena`) ocupa exatamente metade do container, sem quebra de linha.
- Altura consistente e touch-friendly (mínimo 64 px, ideal 72 px no desktop).
- Estado ativo com preenchimento sólido e cor de ambiente; inativo com fundo translúcido e hover claro.

## 2. Delimitação visual entre os espaços

- Divisor central de 1 px com cor semitransparente (`rgb(255 255 255 / 0.18)`).
- Cada metade com sua própria borda arredondada interna (top-left/bottom-left para restaurante, top-right/bottom-right para arena).
- Borda externa do container arredondada (`border-radius: 1rem`) e com sombra sutil para dar profundidade.
- Cores de ambiente:
  - **Restaurante:** gradiente quente âmbar/dourado (`#fff6ea → #ffd7a8` ativo; fundo escuro translúcido inativo).
  - **Arena:** gradiente frio azul-elétrico (`#eef4ff → #c3d8ff` ativo; fundo escuro translúcido inativo).
- Ícone e label centralizados verticalmente; label em peso forte e tamanho legível.

## 3. Remoção de elementos do hero

- Remover o botão **"Novo evento"** e o botão de **sincronização/RefreshCw** do `.venue-command-hero__actions`.
- Remover o parágrafo `.venue-command-hero__context` que exibe "Agenda Arena Fenasoja · até 5.000 pessoas · 1 evento".
- O hero passa a conter apenas o seletor de workspaces, sem ações laterais.
- O botão "Novo evento" será realocado para dentro da própria tela de agenda/eventos (ação contextual), não no seletor global.

## 4. Ajustes no componente React

- Em `VenueWorkspace.tsx`: limpar `venue-command-hero__actions` e `venue-command-hero__context`; manter apenas `<VenueWorkspaceSwitcher .../>` dentro do hero.
- Em `VenueWorkspaceSwitcher.tsx`: remover o elemento `<small>{description}</small>` do card; manter apenas ícone, label e contador de eventos.
- Adicionar atributos de acessibilidade mantidos: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-label`.

## 5. Responsivo

- Desktop: duas colunas 50/50, altura 72 px, label 1 rem.
- Tablet/mobile: manter grid 1fr 1fr, altura mínima 56 px, label 0.875 rem; descrições já estão removidas, então não há quebra de texto.
- Garantir que o container não estoure horizontalmente (`overflow-x: clip` já existe no pai).

## 6. Validação

- Verificar visualmente no preview que o seletor ocupa toda a largura, com metades simétricas.
- Confirmar que não há botão "Novo evento" nem ícone de sincronização no hero.
- Confirmar que as descrições e metadados do espaço ativo sumiram do card.
- Testar troca entre Restaurante e Arena mantendo navegação fluida.
