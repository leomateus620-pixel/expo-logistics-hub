# Mapa Comercial — árvores mais naturais e modo pavilhão focado

Duas frentes coordenadas no módulo Mapa Comercial: refinar a vegetação 3D e reconstruir a experiência interna dos pavilhões (estabilidade na saída + blocos internos realmente clicáveis).

## Frente 1 — Copas das árvores

Hoje cada árvore é montada com 4 lobos de icosaedro opacos, material com `emissive` forte (0,48) e escala grande, o que produz a leitura de "bloco verde" sobre os lotes.

O que muda:

- Silhueta orgânica: mais lobos menores e achatados, com deslocamento pseudoaleatório determinístico por árvore, formando uma copa arredondada e irregular em vez de duas bolas grandes.
- Massa foliar mais leve: transparência sutil e leve variação de cor por lobo, reduzindo o bloqueio visual sobre lotes e rótulos.
- Emissivo reduzido e paleta reequilibrada (verdes mais dessaturados, oliva/sálvia) para harmonizar com a linguagem clara do mapa.
- Integração tronco–copa: copa começa logo acima da forquilha, com os galhos existentes entrando na massa foliar.
- Custo mantido: continua tudo em `InstancedMesh` (mesmos 4 draw calls do color pass); os lobos extras só existem em gráficos completos, e o modo reduzido continua com contagem menor.

Validação: leitura de rótulos e limites de lote perto das áreas arborizadas (Quadras D, E, I, J), e contagem de draw calls inalterada.

## Frente 2 — Bug de saída do interior (prioridade)

Diagnóstico ainda não confirmado em execução; a primeira etapa é reproduzir e instrumentar a saída para identificar a causa exata. Os pontos suspeitos já mapeados na leitura do código:

- A cena interna e a cena externa são retornos alternativos do mesmo componente `Scene`, cada uma declarando `<color attach="background">`, `<fog attach="fog">` e seu próprio `OrbitControls makeDefault`. A troca abrupta pode deixar background/fog/controles órfãos e a câmera com `near/far/fov` do interior.
- `CameraRig` externo remonta e tenta restaurar `interiorReturnView`; se `controlsRef` ainda não existir no primeiro efeito, a câmera pode ficar em um estado inválido.
- Cenas internas são `lazy` dentro de um `Suspense` interno ao `Canvas`; uma falha de import ou de dispose durante a transição derruba a árvore e deixa apenas o fundo do shell visível.

Correção estruturada (após confirmar a causa):

- Extrair o ambiente da cena (background, fog, luzes base, câmera) para uma camada única que reage ao modo, em vez de duas árvores concorrentes.
- Um único ponto de controle de câmera com reset explícito de `near/far/fov` e alvo válido ao voltar, aplicando `interiorReturnView` apenas quando os controles já existem.
- Limpeza determinística na saída: cursor, `cameraNavigating`, hover, seleção de módulo e `shadowMap.autoUpdate`.
- Error boundary dedicado dentro do `Canvas` para a cena interna, com retorno seguro ao mapa em vez de tela quebrada.
- Validação: ciclos repetidos de entrar/sair em vários pavilhões, sem recarregar a página, verificando console limpo e navegação normal ao voltar.

## Frente 3 — Modo pavilhão focado e blocos interativos

Estado atual verificado: em `CommercialPavilionModuleLayer` todos os meshes usam `raycast={NO_RAYCAST}` e o store não tem estado de módulo — por isso nenhum bloco interno é clicável hoje.

O que muda:

- Camada de interação: os módulos passam a receber raycast na cena interna (mantendo o cutaway externo inerte), com hitbox ampliada em altura para clique confiável mesmo em módulos pequenos.
- Estado no store: `hoveredModuleId` / `selectedModuleId`, limpos ao sair do interior.
- Feedback visual: hover com realce de cor e leve elevação; selecionado com contorno/cor destacada e prioridade de leitura; cursor `pointer` sobre módulo.
- Painel lateral do módulo (PT-BR): identificador, zona, área e situação comercial quando houver vínculo com lote, reusando os painéis existentes.
- Foco real: na cena interna, remover ruído remanescente e enquadrar a planta com margem; botão "Voltar ao mapa" permanece e `Escape` continua funcionando.

## Detalhes técnicos

Arquivos previstos:

- `src/features/commercial-map/components/canvas/CommercialTreeLayer.tsx` — nova geometria/paleta de copa.
- `src/features/commercial-map/utils/treeLayer.ts` — constantes de lobos e orçamento de instâncias.
- `src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx` — separação de ambiente/câmera, error boundary da cena interna.
- `src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx` — modo focado e limpeza de estado.
- `src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx` — raycast, hover/seleção instanciados.
- `src/features/commercial-map/state/useCommercialMapStore.ts` — estado de módulo e reset na saída.
- `src/features/commercial-map/components/panels/MapPanels.tsx` e CSS do módulo — painel do módulo selecionado.
- Testes em `src/test/commercialMapPavilionRendering.test.ts` atualizados para o novo contrato de raycast/seleção.

Performance: instancing mantido, sem novas texturas por módulo, hover/seleção aplicados via `instanceColor` (sem remontar meshes), `frameloop="demand"` preservado.
