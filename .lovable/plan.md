# Mapa Comercial — ícones de visualização no topo, demais controles na barra lateral

Correção do layout atual: a faixa no topo do mapa passa a conter apenas os controles de visualização, e todo o resto volta para a barra lateral, com o resumo de lotes no fim.

## 1. Faixa no topo do mapa (somente visualização)

Passa a ter um ícone por ação direta, sem popovers de grupo:

- Visão geral (ou Exporural, conforme a área ativa)
- Vista superior
- Isométrica
- Centralizar seleção (desabilitado quando não há seleção)
- Camadas do mapa
- Ocultar / exibir árvores
- Validação técnica (apenas quando o usuário tem permissão)

Cada ícone com tooltip, estado ativo visível e tipografia/ícones mais refinados (traço mais leve, tamanhos uniformes, faixa mais estreita e discreta).

## 2. Barra lateral — nova ordem

A barra lateral volta a ser o painel de controle, nesta sequência:

1. Área do mapa — Parque completo / Exporural (oculto no escopo de comissão)
2. Segmentos — Exporural, Uso comercial e serviços, Espaço automóvel etc. (oculto no escopo de comissão)
3. Situações comerciais — Disponível, Reservado, Vendido, Bloqueado (+ abrir resultados, limpar)
4. Gestão — editar geometria, calibrar, cadastrar lote, publicar, sincronizar (apenas com permissão)
5. Lista e tabela — alternância entre mapa 3D e lista, agora fora do topo
6. Resumo comercial — "262 lotes cadastrados", contagens por situação e área disponível, no fim da barra

Cada bloco volta a ser uma seção expansível dentro da barra; quando recolhida, mostra apenas ícones e o resumo compacto.

## 3. Busca no topo do módulo

A busca sai da barra lateral e da faixa do mapa: fica ao lado do título "Mapa Comercial", no cabeçalho, como campo expansível pelo ícone de lupa (também em desktop), mantendo `Ctrl/Cmd+K` e o clique/Enter para abrir resultados.

## 4. Barra lateral mais estreita

Largura expandida reduzida de 296px para ~232px (recolhida segue como rail de ícones), liberando área para o mapa. Tipografia e espaçamentos internos ajustados para a nova largura.

## Detalhes técnicos

- `CommercialMapTopBar.tsx`: reescrito como rail de ações diretas (câmera, centralizar, camadas, árvores, validação), sem `Popover`; CSS correspondente enxugado em `commercial-map-topbar.css`.
- `CommercialMapDock.tsx`: volta a hospedar as seções (área, segmentos, situações, gestão, lista/tabela) usando `dockSection` do `useCommercialMapStore`, com `CommercialSummary variant="dock"` renderizado por último no scroll.
- `CommercialMapPage.tsx`: passa `entities`, `lots`, escopo, callbacks de segmento e `managementActions` para o dock em vez do topo.
- `CommercialMapShell.tsx`: busca expansível liberada em desktop, ancorada ao título; ajustes em `commercial-map-shell.css`.
- `commercial-map-dock.css`: `--dock-width` ~232px, seções reaproveitadas e resumo posicionado ao fim.
- Mobile (≤720px) mantém o comportamento atual de drawers/toolbar.

## Validação

Playwright em 1265x788 e 1440x900: cada ícone do topo aplica sua ação, seções da barra lateral abrem e filtram corretamente, resumo aparece no fim (expandida e recolhida) e a busca funciona no cabeçalho.
