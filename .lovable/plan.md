# Links públicos com parque completo e consulta restrita ao segmento

Objetivo: nos três links públicos (Espaço do Automóvel, Indústria/Comércio/Serviços externa e Exporural) o visitante passa a ver o parque inteiro — ruas, pavilhões, estruturas, vegetação, lotes vizinhos — com foco inicial na sua área. Somente os lotes do link abrem metragem, disponibilidade, preço por m² e total. Os links de pavilhão continuam exatamente como estão hoje.

## Causa do recorte atual

A consulta pública recebe do servidor apenas as entidades do próprio escopo (a função `public_map_inventory` filtra tudo pelo conjunto de lotes do link) e ainda desenha a cena em modo "área isolada" (`isolatedArea`), que desliga ruas de fundo, estacionamentos e camadas de entorno. Ou seja, o recorte é duplo: dados e renderização.

## O que muda

### 1. Contexto visual (servidor)
Nova função pública `public_map_context`, somente leitura e validada por token, que devolve o cenário do parque em versão sanitizada: geometria, elevação, rotação, classificação, camada e nome cartográfico. Sem lotes, sem preços, sem status comercial, sem metadados internos. Exclui arquivados e exclui módulos internos de pavilhão.

A `public_map_inventory` continua igual, entregando somente os lotes do link com os dados comerciais publicáveis. A `public_map_lot` continua revalidando no servidor o vínculo lote↔link (uma tentativa com lote de outro segmento continua negada, mesmo com a geometria visível na tela).

### 2. Três responsabilidades separadas (cliente)
- `visualContextEntities`: cenário completo publicável, mesclado com as entidades do escopo.
- `interactiveEntityIds`: allowlist derivada exclusivamente dos lotes do link.
- `publicScope` + `focusBounds`: dados comerciais e enquadramento inicial.

Sem nenhum filtro único de segmento controlando as três coisas ao mesmo tempo.

### 3. Renderização
Para esses três links, `isolatedArea` passa a ser nulo: ruas, calçadas, pavilhões, quadras, estacionamentos, vegetação e terreno voltam a ser desenhados com as mesmas geometrias, materiais e camadas oficiais. O segmento ativo recebe apenas um realce sutil de contorno/sinalização — sem escurecer, dessaturar ou cobrir o entorno, e sem se confundir com cores de status comercial.

### 4. Interação
Nova verificação única `canInspectLot(scope, entityId)` aplicada em clique/toque, hover, raycasting, cursor, lista, busca, teclado, seleção programática e abertura por URL. Lotes fora do link: sem ficha, sem tooltip comercial, sem cursor de ação, sem evento de interesse, sem entrada em pavilhão. Ruas e estruturas mantêm apenas nomes cartográficos. Seleção continua individual, sem carrinho, reserva ou edição.

### 5. Câmera
Enquadramento inicial pelos limites dos lotes e estruturas do segmento, com margem para as vias vizinhas, calculado considerando cabeçalho, rodapé, controles e ficha aberta (no celular o lote selecionado não fica sob o painel). Zoom, pan, afastamento e rotação livres dentro dos limites do parque inteiro. Botão "Reenquadrar área" com transição suave. A câmera não é reposicionada a cada atualização de dados ou telemetria.

### 6. Aviso de atualização
O aviso "Nova versão da consulta disponível" sai da área central e vira uma faixa compacta no rodapé, não bloqueante, que desaparece após a atualização e não reaparece em laço. Atualizações de cadastro (lotes, preços, geometria) continuam chegando sozinhas em até 30 segundos, sem clique e sem recarregar a página.

### 7. Telemetria
O evento é sempre registrado com o segmento do link, independentemente de onde a câmera esteja. Navegar pelo entorno não cria visita nem interesse em outros segmentos; carregamento progressivo e revalidação não inflam métricas. Só seleção válida com ficha exibida gera interesse.

### 8. Desempenho
Mantém instancing, materiais e geometrias compartilhados, LOD e frustum culling, com prioridade de carregamento para o segmento e suas vias de acesso e qualidade adaptativa no celular. LOD não remove permanentemente ruas, edifícios ou lotes necessários.

## Detalhes técnicos

- Migração: `public_map_context(_slug, _token)` SECURITY DEFINER, `search_path = public`, EXECUTE restrito ao mesmo papel das demais RPCs públicas; nenhuma permissão nova sobre tabelas internas.
- `publicMapService.ts` / `publicMapTypes.ts`: `fetchPublicContext`, tipo `PublicContextEntity`, merge determinístico (entidade do escopo prevalece sobre a de contexto).
- `usePublicMapArea.ts`: hook `usePublicMapContext` com cache próprio por área, revalidado pela mesma revisão de escopo já existente.
- `PublicAreaMapPage.tsx`: monta `entities = contexto ∪ escopo`, mantém `lots` apenas do escopo, deixa de passar `isolatedArea` para os três links e passa `publicInteraction={{ interactiveEntityIds, focusBounds, highlightSegmentId }}`.
- `CommercialMapCanvas.tsx`: nova prop opcional `publicInteraction`; quando presente, gate em `handleEntitySelect`, hover/tooltip, cursor e entrada de interior; `CameraRig` usa `focusBounds` com insets de viewport; nada muda quando a prop está ausente (mapa administrativo, comissões, vendas e links de pavilhão intactos).
- Links de pavilhão: continuam com `pavilionIdentifier` e visualização dedicada, sem contexto externo.

## Testes

- Unitários: `canInspectLot` (allowlist, URL, lista, busca), merge de contexto sem vazar campo comercial, totais/lista/busca restritos ao segmento, telemetria fixada no segmento do link, aviso de versão sem laço.
- Integração/serviço: `public_map_lot` negando lote de outro segmento nos três links; payload de contexto sem comprador, contrato, nota interna ou preço mínimo.
- Navegador: os três links abrindo focados, com ruas conectadas e estruturas presentes; zoom/pan sem cortes; seleção válida abre ficha; toque/mouse/teclado/lista/busca/URL em lote de outro segmento não abre nada; ICS externa não entra em módulo de pavilhão; comparação antes/depois em desktop e celular.
- Regressão: mapa administrativo, portais de comissão, modo vendas e links de pavilhão.

Evidências serão apresentadas separando o que foi executado do que ficou pendente (a cena 3D trava no navegador headless deste ambiente; se não for possível capturar, isso será declarado em vez de afirmado como validado).

Nada será publicado.
