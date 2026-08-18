# Agenda Restaurante e Arena — arquitetura com sidebar compacta

Refatoração de apresentação do módulo, alinhada à lógica de eficiência espacial da Agenda FenaSoja. Nenhuma regra de negócio, consulta ou permissão muda: apenas a organização visual e de navegação.

## 1. Sidebar operacional compacta (desktop)

A barra horizontal Planejamento / Gestão / Controle sai e vira uma coluna vertical estreita à esquerda, sempre visível, com:

```text
[ + Novo evento ]      ação primária no topo
------------------------------------------
Agenda
Eventos
Contrapartidas
Patrocinadores
Histórico
Relatórios
```

- "Operação" é removido do menu (view e rota deixam de existir; acessos antigos caem em Agenda).
- Rótulos de grupo viram divisores discretos, sem caixas.
- Botão de recolher a sidebar para modo ícone (estado guardado no navegador), com tooltips quando recolhida.
- Estado ativo sólido com o acento do ambiente; hover, foco e pressed definidos.

## 2. Novo evento na sidebar

O card horizontal "Novo evento" desaparece. Vira botão compacto de destaque no topo da sidebar, com o mesmo fluxo de criação e o espaço do ambiente ativo já pré-selecionado. Quando recolhida, vira botão de ícone com tooltip. Continua oculto para quem não tem permissão de criação.

## 3. Seletor Restaurante × Arena compacto

O hero grande dá lugar a um switcher segmentado de baixa altura acima do conteúdo:

```text
[ ⌁ Restaurante 97 ] [ ⌁ Arena 1 ]
```

Altura reduzida, padding enxuto, tipografia mais precisa, ícones consistentes, contraste alto, transição suave e indicação inequívoca do ambiente ativo. Sem gradiente extenso nem card dentro de card.

## 4. Contexto comanda tudo

Mantido o comportamento atual (a rota `/eventos-restaurante-arena/:ambiente/:secao` já é a fonte da verdade): trocar de ambiente preserva a seção aberta, e trocar de seção preserva o ambiente. Agenda, Eventos, Contrapartidas, Histórico e Relatórios continuam recortados pelo espaço ativo; Patrocinadores segue compartilhado.

## 5. Prioridade para os eventos

Com a saída do hero e da barra de navegação horizontal, o conteúdo sobe: na Agenda, o cabeçalho da seção fica em uma linha (título + janela + filtros) e os primeiros eventos aparecem logo abaixo do switcher. Os cartões de evento ganham largura e respiro interno.

## 6. Espaço útil

Revisão dos containers do módulo: grid de duas colunas (sidebar de largura fixa + conteúdo fluido), gutter lateral único, remoção de `max-width` centralizador, gaps e paddings padronizados. Sem faixas vazias entre viewport, sidebar, conteúdo e borda direita.

## 7. Mobile

- Sidebar vira drawer compacto, aberto por um único controle no topo.
- Dentro do drawer: Novo evento e depois as seis seções.
- O switcher Restaurante/Arena fica fora do drawer, em linha compacta no topo do conteúdo — troca em um toque.
- A barra inferior de abas atual é substituída por esse fluxo, deixando a tela dominada pelos eventos.

## 8. Acabamento

Tipografia mais precisa, contraste alto, bordas finas, sombras contidas e microinterações curtas. Sem cards aninhados, gradientes largos, menus coloridos ou glassmorphism que atrapalhe leitura.

## Detalhes técnicos

- Novos componentes: `VenueSideNav.tsx` (rail desktop, colapsável, com ação de criar) e `VenueMobileNavDrawer.tsx`; `VenueWorkspaceSwitcher.tsx` reescrito como controle segmentado. `VenueCreateEventBar.tsx` é removido.
- `VenueWorkspace.tsx`: remove `NAV_GROUPS`/`venue-desktop-nav`/`venue-mobile-nav` e o hero; passa a renderizar o grid `sidebar + main`. Remove `operacao` de `NAV_ITEMS`, `viewContent`, do mapa de slugs e `renderOperation`; slug legado `operacao` redireciona para `agenda`.
- Estilos concentrados em `src/styles/venue-events-shell.css` (nova camada de shell/sidenav) com limpeza dos blocos de hero e nav horizontal em `venue-events-production.css`; acento por ambiente via variável, sem cores fixas nos componentes.
- Sem alteração de banco, hooks de dados, RLS ou permissões.

## Validação

- Restaurante e Arena em Agenda, Eventos, Contrapartidas, Patrocinadores, Histórico e Relatórios.
- Troca de ambiente preservando a seção; URLs diretas e refresh.
- Criação de evento a partir da sidebar nos dois ambientes.
- Sidebar expandida e recolhida; drawer mobile aberto/fechado.
- Larguras 1440, 1280, 1024, 768 e 390 sem overflow, clipping ou faixas vazias.
