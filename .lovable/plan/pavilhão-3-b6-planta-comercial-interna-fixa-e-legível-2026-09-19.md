# Pavilhão 3 (B6) — planta comercial interna fixa e legível

## Objetivo

Transformar exclusivamente o interior do Pavilhão 3 (`B6`) em uma planta comercial interativa: orientação fixa, módulos planos, numeração prioritária, pan e zoom limitados ao conteúdo útil. Preservar integralmente os 214 módulos, áreas, IDs, geometria oficial, corredores, acessos, estados comerciais, seleção e modo Vendas.

A base local já está no commit de referência `e1a9e03424dd7eb4f840b48e73a4b80a75e1954e`; não será necessário alterar histórico ou aplicar sincronização destrutiva.

## Estado atual confirmado

- O tipo `CommercialPavilionInteriorPresentation` já é propagado da referência oficial ao plano compartilhado, mas hoje suporta apenas `fit: 'official-content'`; o B6 ainda não possui configuração própria.
- A câmera interna atual usa dimensões gerais do layout, distância por multiplicadores e limites amplos. `InteriorCameraRequest` ainda não expõe `enableRotate`.
- O `CameraRig` aplica `controls.enableRotate = true` ao entregar uma transição e o `OrbitControls` recebe rotação habilitada genericamente; portanto o bloqueio deve ser parte do contrato da câmera, não uma correção posterior.
- Os módulos internos usam dois `InstancedMesh` (base e volume), altura variável e escalas maiores para hover/seleção/carrinho. A camada numérica continua corretamente concentrada em uma única `CanvasTexture`.
- A textura atual usa 1536/2048 px, desenha número e eventualmente área, e já respeita o frame orientado da planta. A melhoria será um perfil de legibilidade, não uma troca por labels individuais.
- Corredores, seleção comercial, clique direto de Vendas e wayfinding já compartilham o mesmo frame oficial e serão preservados.

## Implementação

### 1. Perfil canônico exclusivo do B6

- Evoluir `CommercialPavilionInteriorPresentation` com opções declarativas para navegação e desenho, mantendo compatibilidade com os perfis existentes:
  - modo `plan` / navegação `locked-plan`;
  - `enableRotate: false`;
  - módulos planos;
  - prioridade máxima para números;
  - área omitida da superfície;
  - enquadramento pelo envelope dos módulos;
  - pan e zoom limitados.
- Declarar esse perfil uma única vez na referência do Pavilhão 3 e propagá-lo pelo plano já existente.
- Não espalhar comparações com `B6` pelos renderizadores; componentes compartilhados consumirão o perfil.
- Não tocar em ranges, células, `moduleGap`, corredores, acessos, projeção, áreas ou fonte oficial do B6.

### 2. Câmera fixa, enquadramento responsivo e transição

- Adicionar `enableRotate?: boolean` ao `InteriorCameraRequest` e fazê-lo valer em todos os caminhos do `CameraRig`: propriedades React do `OrbitControls`, conclusão/cancelamento de transição, restauração e entrega para o primeiro gesto.
- Manter o padrão atual para todos os outros interiores; somente o perfil do B6 solicitará rotação desativada.
- Calcular o enquadramento inicial do B6 pelo envelope projetado dos módulos, proporção real do viewport, FOV e margens seguras; evitar distância arbitrária baseada apenas na edificação.
- Usar uma vista quase top-down, alinhada pela rotação canônica já existente, sem alterar coordenadas dos lotes.
- Derivar `minDistance`, `maxDistance` e `panBounds` do mesmo envelope útil, com margens suficientes para perímetro e acessos, mas sem permitir miniaturização ou navegação para o vazio.
- Preservar `startCameraMove`, interpolação de posição/alvo/lente e retorno ao mapa; controles só serão liberados após a chegada, com pan/zoom ativos e rotate inativo.
- Garantir gestos: mouse/trackpad e um dedo fazem pan; roda/pinch fazem zoom; nenhum gesto rotaciona o B6.

### 3. Módulos planos sem perder instancing

- Fazer `CommercialPavilionModuleLayer` consumir o perfil de apresentação.
- No perfil plano:
  - reduzir base e superfície a lâminas finas estáveis;
  - remover `heightScale` de hover, seleção e carrinho;
  - manter feedback por cor, contraste e borda instanciada;
  - manter a matriz Y constante em todos os estados;
  - desabilitar sombra individual dos lotes quando não agregar leitura.
- Preservar os `InstancedMesh`, geometrias e materiais compartilhados, `instanceColor`, picking por instância e o atlas numérico único.
- Manter o comportamento 3D atual dos demais pavilhões e do recorte externo.
- Compatibilizar também módulos irregulares com o perfil, sem criar uma segunda implementação.

### 4. Numeração de alta legibilidade

- Tornar `createModuleNumberTexture` orientada pelo perfil e pelo viewport/capacidade gráfica.
- Para o B6:
  - aumentar o número dentro da célula disponível;
  - reforçar peso, preenchimento e contorno de alto contraste;
  - centralizar pela âncora oficial e manter orientação canônica uniforme;
  - omitir a metragem da superfície para não competir com o número;
  - escolher resolução adaptativa limitada, evitando 4K indiscriminado no mobile;
  - configurar filtragem e pixel ratio para reduzir borramento em zoom intermediário.
- Manter áreas intactas e disponíveis nos detalhes; nenhuma informação comercial será recalculada ou removida.

### 5. Hierarquia visual e interação

- Refinar apenas para o perfil plano o contraste entre lotes, corredores e apoios, sem alterar dimensões ou coordenadas.
- Manter Entrada, Saída, Saída de emergência e ligação entre pavilhões nas posições e destinos atuais; ajustar somente a leitura sob câmera fixa se necessário.
- Preservar integralmente `moduleStateById`, filtros, hover, seleção, `dispatchSalesModuleClick`, carrinho e estados vendido/reservado/negociação/disponível.
- Garantir feedback visível sem depender de hover e cursor coerente em mouse, touch e modo Vendas.

## Arquivos previstos

- `src/features/commercial-map/data/commercialPavilionReference.ts` — ampliar o contrato de apresentação.
- `src/features/commercial-map/data/pavilion3CommercialReference.ts` — declarar somente o perfil interno do B6, sem alterar geometria oficial.
- `src/features/commercial-map/hooks/useInteriorCameraRequest.ts` — adicionar o controle estrutural de rotação.
- `src/features/commercial-map/utils/commercialPavilionModules.ts` — propagar/derivar envelope útil e opções do perfil.
- `src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx` — framing responsivo e limites do B6.
- `src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx` — respeitar `enableRotate` em todos os estados dos controles.
- `src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx` — módulos planos, atlas legível e feedback sem elevação.
- Testes do mapa comercial, com um arquivo específico para o perfil B6 se isso mantiver os contratos mais claros.

## Validação automatizada

- Confirmar 214 módulos e todas as faixas oficiais: 01–19, 20–36, 37–40, 41–47, 48–79, 80–111, 112–143, 144–175 e 176–214.
- Comparar antes/depois os IDs, áreas oficiais, soma de 663,00 m², células, corredores, acessos e vínculos comerciais.
- Testar que B6 usa perfil plano, rotação desativada, área ausente apenas no atlas e limites derivados do envelope.
- Testar que hover, seleção e carrinho não alteram a altura no B6.
- Testar que os demais pavilhões mantêm rotação, volumetria e comportamento anteriores.
- Preservar testes de picking, Vendas, wayfinding, filtros, descarte de recursos e instancing.
- Executar testes direcionados e verificação TypeScript do escopo.

## Validação real no navegador

- Comparar capturas antes/depois do B6 em desktop, notebook, tablet e mobile, incluindo retrato e paisagem.
- Exercitar entrada suave, zoom máximo/mínimo, pan até todos os limites, roda, trackpad, drag, toque e pinch.
- Confirmar por interação que mouse drag e dois dedos nunca rotacionam o B6, enquanto pan e zoom continuam fluidos.
- Conferir leitura dos números em visão inicial e zoom intermediário, corredores, acessos, hover, seleção, filtros e modo Vendas.
- Entrar em pelo menos outro pavilhão para provar que sua câmera e seus módulos continuam iguais.
- Verificar console, erros de rede, estabilidade de entrada/saída repetida e ausência de regressão visual ou aumento relevante de custo WebGL.

## Invariantes

- Nenhuma migration ou alteração de dados.
- Nenhuma mudança em áreas, preços, regras 2028, status, contratos, vendas ou Pavilhão 7.
- Nenhuma mudança em IDs, numeração, relações, rotas, geometria, sequência, corredores ou acessos do B6.
- Nenhum label DOM/Text por lote, material por lote, sombra individual desnecessária ou estado React por frame.
- Nenhuma publicação automática.
