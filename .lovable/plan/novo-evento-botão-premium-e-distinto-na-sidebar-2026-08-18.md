# "Novo evento" — botão premium e distinto na sidebar

Hoje o botão "Novo evento" usa o mesmo azul-índigo do item ativo do menu (Agenda), o que anula sua hierarquia: a ação primária compete visualmente com o estado de navegação. A mudança é puramente visual.

## Nova identidade

- Superfície dourada institucional (gold Fenasoja) com leve gradiente vertical e tinta escura navy no texto/ícone — contraste alto e imediatamente diferente de qualquer item de menu.
- Ícone "+" dentro de um pequeno badge circular translúcido à esquerda, texto em peso alto e tracking levemente negativo.
- Realce superior sutil (linha de luz interna) e sombra colorida projetada, no registro Liquid Glass já usado no módulo.
- Altura um pouco maior que os itens de navegação para reforçar que é ação, não seção.
- Hover: brilho e elevação curtos; pressed: recuo de 1px; foco visível com anel dourado.
- Estado recolhido: vira botão quadrado dourado só com o "+", mantendo tooltip.

## Onde aparece

- Sidebar desktop (expandida e recolhida).
- Drawer mobile: mesmo tratamento dourado, mantendo o subtítulo "Cadastrar na {ambiente}".
- O acento do ambiente (Restaurante/Arena) segue apenas nos itens de menu; o botão de criação mantém o dourado fixo em ambos, para ser sempre a mesma âncora de ação.

## Detalhes técnicos

- Alterações restritas a `src/styles/venue-events-navigation.css`: reescrita das regras `.venue-sidenav__create` (incluindo variação `[data-collapsed]`) e `.venue-nav-drawer__create`, com novas variáveis locais de gradiente/sombra.
- Ajuste mínimo em `VenueSideNav.tsx` e `VenueMobileNavDrawer.tsx` apenas para envolver o ícone em um `span` de badge.
- Sem mudanças de rota, dados, permissões ou lógica de criação de evento.

## Validação

- Restaurante e Arena, sidebar expandida e recolhida, drawer mobile.
- Contraste do texto sobre o dourado e visibilidade do foco por teclado.
- 1440, 1280, 1024 e 390 px sem quebra de layout.
