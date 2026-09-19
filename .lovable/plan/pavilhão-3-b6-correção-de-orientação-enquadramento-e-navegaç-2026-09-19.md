# Pavilhão 3 (B6) — correção de orientação, enquadramento e navegação

Correção da regressão introduzida na última entrega. Nada de dados oficiais é tocado: os 214 módulos, IDs, numeração, áreas, corredores, preços, status e vendas permanecem exatamente como estão. A mudança é só de câmera, controles e enquadramento, e vale apenas para o Pavilhão 3.

## Causas identificadas

1. **Orientação girada**: no perfil novo de planta, a câmera é posicionada com a rotação base do pavilhão, enquanto a planta em si é desenhada com a rotação base **mais** a rotação de vista interna. As duas deixaram de coincidir, então o pavilhão aparece virado.
2. **Arrastar não funciona**: ao desligar a rotação, o botão esquerdo do mouse continuou associado ao gesto de girar. Como girar está proibido, arrastar não faz nada — sobrou só o zoom. Nos controles nunca foi definido o mapeamento de botões do mouse.
3. **Acessos cortados**: o enquadramento inicial usa apenas o retângulo dos módulos, ignorando paredes, corredores e os ícones de entrada, saída, emergência e conexão — por isso as extremidades ficam fora da tela.
4. **Limites de deslocamento estreitos**: a área navegável foi calculada sobre o mesmo retângulo reduzido dos módulos, prendendo a visão perto do centro.

## O que será feito

### Orientação canônica
- A câmera do Pavilhão 3 passa a usar a mesma transformação de orientação que a planta desenhada, restaurando a direção original.
- Nenhuma rotação compensatória será aplicada nos números dos lotes nem nos módulos.
- A rotação manual continua bloqueada.

### Enquadramento completo
- O enquadramento inicial passa a considerar o envelope de apresentação completo: módulos, corredores, paredes internas e todos os marcadores de acesso, com uma margem visual.
- Resultado: o pavilhão inteiro aparece de início, com todos os ícones de entrada/saída/emergência/conexão visíveis, sem cortes em cima ou embaixo.

### Navegação (exclusivo do Pavilhão 3)
- Mouse: botão esquerdo arrasta a planta; botão direito também arrasta; roda dá zoom; botão do meio aproxima/afasta.
- Trackpad: arrastar move; pinça dá zoom.
- Toque: um dedo move; dois dedos dão zoom e movem juntos; nunca gira.
- Zoom com faixa confortável: dá para ver o pavilhão inteiro com os acessos e dá para aproximar o suficiente para ler os números dos lotes, sem virar miniatura.
- A área de deslocamento passa a ser derivada do envelope completo mais margem proporcional, permitindo chegar às sequências 01–36, ao miolo, à 176–214 e às quatro extremidades.

### Câmera estável depois do gesto
- Revisão da cadeia que reposiciona a câmera (entrada cinematográfica, reajuste ao redimensionar, limites e travas de alvo) para garantir que, depois do movimento do usuário, a visão permaneça onde ele deixou e não volte sozinha ao centro.
- A inclinação da vista continua praticamente de cima, mas com um ângulo mínimo seguro que evita instabilidade e cortes.

### Preservado
- Lotes planos, sem blocos subindo; seleção por cor/borda; destaque no hover; números em prioridade máxima.
- Wayfinding, tooltips, status, seleção, carrinho e rotas seguem funcionando.
- Demais pavilhões mantêm o comportamento atual, inclusive rotação.

## Verificação
- Testes automatizados de regressão para o Pavilhão 3: rotação desligada, deslocamento ligado, botão esquerdo mapeado para mover, toque de um dedo mover, dois dedos sem girar, marcadores de acesso presentes no enquadramento, orientação canônica estável e alvo da câmera realmente deslocável dentro dos limites. Mais um teste garantindo que os outros pavilhões não mudaram.
- Validação visual real no mapa comercial, entrando no interior do Pavilhão 3, em desktop e em tela de celular: captura da visão inicial completa e captura após arrastar até uma extremidade, comprovando que o movimento funciona.
- Nada será publicado.

## Detalhes técnicos
- `pavilion3CommercialReference.ts`: o perfil `interiorPresentation` do B6 ganha `enablePan`, `mouseNavigation: 'pan'`, `touchNavigation: 'pan-dolly'`, `preserveCanonicalOrientation` e `includeWayfindingInFit`; nenhuma célula, range, gap, corredor ou área é alterada.
- `commercialPavilionReference.ts` / `useInteriorCameraRequest.ts`: novos campos opcionais no contrato de apresentação e no `InteriorCameraRequest` (`mouseButtons`, `touches`), mantendo `fit` compatível com os pavilhões `official-content`.
- `CommercialPavilionInteriorScene.tsx`: o ramo `mode: 'plan'` passa a usar `toWorld` (com `interiorViewRotation`) em posição, alvo e `panBounds.facing`; o envelope de fit passa a unir módulos, corredores, shell interno e acessos de wayfinding; `minDistance`/`maxDistance` recalculados sobre esse envelope; margens de pan proporcionais e mais generosas.
- `CommercialMapCanvas.tsx`: `OrbitControls` recebe `mouseButtons` derivado do frame interior (`LEFT: PAN`, `MIDDLE: DOLLY`, `RIGHT: PAN` quando `enableRotate === false`, caso contrário o padrão atual); `touches` já condicional será confirmado como `DOLLY_PAN`; revisão de `clampCameraTarget`, `clampQueuedCameraPose`, `preserveManualView`, `startCameraMove`, `queueInterior` e do refit por resize para não desfazer o gesto.
- Testes: novo arquivo de regressão do B6 e atualização dos contratos compartilhados existentes.
