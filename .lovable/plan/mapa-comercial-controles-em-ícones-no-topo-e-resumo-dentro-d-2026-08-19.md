# Mapa Comercial — controles em ícones no topo e resumo dentro da barra lateral

Inversão da hierarquia atual: os controles saem da barra lateral e voltam para uma faixa de ícones flutuante sobre o topo do mapa; o resumo comercial (contagem de lotes por situação e área disponível) sai de cima do mapa e passa a ocupar a área branca da barra lateral.

## 1. Faixa de ícones no topo do mapa

Nova barra horizontal flutuante ancorada no topo do canvas (vidro translúcido, alinhada ao estilo atual do mapa), com um botão de ícone por grupo — os mesmos grupos que hoje estão na barra lateral:

- Busca (abre campo em popover; mantém `Ctrl/Cmd+K`)
- Área do mapa (Parque completo / Exporural) — oculto no escopo de comissão
- Segmentos (lista com cor, nome e nº de lotes, foco/filtro) — oculto no escopo de comissão
- Visualização (presets de câmera, centralizar seleção, camadas, árvores, 3D/lista, validação técnica quando permitida)
- Situações comerciais (filtros por status)
- Gestão (editar geometria, calibrar, cadastrar lote, publicar, sincronizar base) — só com permissão

Cada ícone abre um popover ancorado logo abaixo, com o mesmo conteúdo já existente hoje em cada seção do dock. Um popover por vez; `Esc` fecha. Estado ativo (busca preenchida, segmento em foco, filtros aplicados) sinalizado por ponto/realce no ícone.

## 2. Resumo comercial dentro da barra lateral

O bloco “262 lotes cadastrados · Bloqueado / Disponível / Reservado / Negociação / Vendido · área oficial disponível” deixa de flutuar sobre o mapa e passa a ser renderizado dentro da barra lateral, ocupando a área hoje vazia (branca):

- Layout vertical: número total em destaque no topo, depois uma linha por situação (bolinha de cor, contagem, rótulo), e por fim a área oficial disponível.
- Os itens continuam clicáveis, alternando o filtro de status como hoje.
- Quando a barra está recolhida (rail de ícones), o resumo vira um bloco compacto só com o total e pastilhas coloridas, com tooltip.
- Continua respeitando o escopo ativo (parque, Exporural ou segmento em foco).

A barra lateral fica então dedicada à leitura: identidade do escopo no topo e resumo comercial abaixo, sem os grupos de controle (que migraram para o topo).

## 3. Mobile

Mantém o comportamento atual (drawers, busca compacta e resumo já adaptado). Nenhuma regressão nos breakpoints móveis.

## Detalhes técnicos

- Novo `components/controls/CommercialMapTopBar.tsx` (+ CSS próprio) reaproveitando os corpos de seção já escritos em `CommercialMapDock.tsx`; a lógica de estado continua no `useCommercialMapStore`.
- `CommercialMapDock.tsx` é reduzido a cabeçalho de escopo + slot de resumo; a chave de seção aberta no store passa a controlar o popover do topo.
- `CommercialSummary` (em `components/panels/MapPanels.tsx`) ganha uma variante `dock` (vertical/compacta); a chamada atual dentro de `commercial-map-stage` em `CommercialMapPage.tsx` é removida e o componente passa a ser renderizado pelo dock, recebendo `summaryLots`, escopo e nome do segmento.
- `MapToolbar` permanece apenas com o que é realmente flutuante no mobile.
- Ajustes em `commercial-map.css`, `commercial-map-dock.css` e `commission-map-portals.css` para o novo posicionamento e para não sobrepor pan/zoom do canvas.

## Validação

Playwright em 1440x900 e 1265x788: abertura de cada popover do topo, filtro por segmento e por situação, resumo correto na barra lateral (expandida e recolhida) e ausência de bloqueio de interação no mapa.
