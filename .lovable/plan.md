# Legendas contextuais no Mapa Comercial

Hoje o mapa projeta e mede dezenas de legendas a cada frame (`useSemanticLabelVisibility` roda uma passada de projeção + colisão em todas as entidades, com caps por nível de zoom) e monta um `<Html>` por entidade aceita. O mesmo padrão existe no estacionamento posterior (rótulos de setor/bloco e notas operacionais). O resultado é o excesso visual dos anexos e custo de renderização permanente.

A refatoração troca isso por um controlador único de visibilidade: nenhuma legenda permanente, e no máximo duas legendas montadas (uma de hover, uma de seleção).

## Comportamento final

- Navegação normal (qualquer zoom, rotação, pan, troca de câmera, filtro ou setor): zero legendas na cena.
- Desktop: hover sobre a estrutura mostra uma tooltip leve ancorada à entidade; sai o cursor, some com transição rápida — salvo se a entidade estiver selecionada.
- Foco por teclado (quando o alvo é focável) tem o mesmo efeito do hover.
- Clique/toque: destaque discreto da geometria (já existente), uma única legenda contextual persistente e o painel de informações atual abre/atualiza.
- Mobile: sem hover. Toque curto seleciona (usa o limiar de clique já existente, `MAP_CLICK_MAX_DELTA`); arrasto, rotação e pinça nunca exibem legenda.
- Busca, filtro ou navegação programática: apenas o resultado escolhido fica identificado.
- Fechar painel, trocar de entidade ou voltar à navegação geral remove a legenda — sem duplicação.

## Escopo técnico

1. **Novo controlador** `src/features/commercial-map/hooks/useContextualMapLabel.ts`
   - Estados: `hidden → hovered/focused → selected → hidden`.
   - Deriva de `selectedEntityId`, `hoveredEntityId` e `cameraNavigating` (já no store); hover é suspenso enquanto a câmera se move e em dispositivos de toque (`pointerType`), com throttling curto apenas no hover.
   - Retorna no máximo um alvo de hover e um alvo selecionado.

2. **`CommercialMapCanvas.tsx`**
   - Remove `useSemanticLabelVisibility` (projeção/colisão por frame) e o `.map()` que monta um `EntityLabel` por entidade visível.
   - Renderiza `<EntityLabel>` somente para o alvo selecionado e, quando houver, para o alvo de hover — desmontando os inativos (não `opacity: 0`/`visibility: hidden`).
   - Mantém intactos hover/click handlers, seleção, outline, filtros, dimming, transições de interior e a lógica de câmera.

3. **`EntityLabel`** vira a legenda contextual única: código, categoria e nome com hierarquia discreta, sem truncamento desnecessário, ancorada à entidade (sem girar com a geometria), com correção automática junto às bordas via `calculatePosition` do `Html` (mesmo padrão já usado no layer de wayfinding). Variação visual entre `hovered` (mais compacta) e `selected` (persistente).

4. **`RearParkingLayer.tsx`** segue a mesma regra: os rótulos de setor/bloco e as notas operacionais deixam de ser montados permanentemente; passam a aparecer apenas no hover/seleção do bloco correspondente, preservando a inspeção por clique (o raycast passa a ser feito na malha, não no botão HTML).

5. **Raycasting e limpeza**: garantir `raycast` desativado em camadas puramente decorativas envolvidas nesse fluxo, remover listeners duplicados de hover e fazer cleanup ao desmontar.

6. **Preservado sem alteração**: `mapMetadata.ts` (nomes, aliases, keywords), busca, filtros, painéis, edição, geometria, coordenadas, elevações, texturas, sombras, iluminação, antialiasing e dados comerciais. Os marcadores de wayfinding dentro da vista interna de pavilhão permanecem — são controles de navegação da vista detalhada, não legendas do mapa geral.
   - `resolveStableMapLabelVisibility` e utilitários de colisão de labels deixam de ser usados pelo canvas; ficam apenas se ainda houver consumidores (verificado antes de remover).

## Validação

Comparação antes/depois nas mesmas câmeras (visão geral, médio, próximo, oblíqua) em desktop e mobile, via captura headless do preview:

- Zero legendas em visão geral, média e próxima durante navegação.
- Rotação/pan/zoom sem legendas transitórias.
- Hover desktop exibindo só a entidade apontada; clique mantendo só a selecionada.
- Toque mobile distinguindo seleção de gesto.
- Troca de seleção sem duplicar legenda; fechar painel remove a identificação.
- Busca/filtro centralizando e identificando apenas o resultado.
- Contagem de labels montados (DOM `.commercial-map-label`) e tempo de frame medidos antes e depois; alvo de zero labels atualizados em navegação normal, sem regressão de qualidade gráfica.
