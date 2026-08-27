# Texturas estáveis em zoom distante e ângulos altos

Nas duas áreas texturizadas (Área Motor Home e Área de Test Drive) a textura só se lê bem de perto. Ao afastar a câmera ou olhar de cima em ângulo raso, as áreas voltam a parecer uma laje clara e sem definição.

Causa: a textura procedural atual é quase toda de altíssima frequência (grão pixel a pixel, fios de grama de 3 px, brita de 1 px) e é repetida a cada ~3 metros. Quando o ladrilho passa a ocupar poucos pixels na tela, o mipmap do WebGL faz a média de tudo e o resultado converge para um tom médio chapado; com a cor base branca do material, isso lê como bege/cinza claro — exatamente o que aparece no zoom afastado.

O trabalho continua exclusivamente de visualização: nenhuma alteração em geometria oficial, elevações de apoio, banco, rótulos, seleção, filtros ou dados comerciais.

## O que muda

1. **Macro-variação nas duas texturas** — além do grão fino, cada textura ganha manchas grandes de tom (relvado mais escuro/mais seco na grama; trechos mais claros de brita compactada e faixas de rolagem mais largas no test drive) desenhadas em baixa frequência. Essas manchas sobrevivem ao mipmap e mantêm leitura de terreno real mesmo de longe.

2. **Ladrilho maior e cor base correta** — o ladrilho passa a cobrir uma área maior de mundo (menos repetições visíveis, menos aliasing) e a cor base do material deixa de ser branca: passa a ser o verde de gramado / bege-saibro correspondente. Assim, no limite em que o mipmap achata a textura, a área ainda lê verde (motor home) e saibro (test drive) em vez de branco.

3. **Filtragem consistente em qualquer ângulo** — mipmaps explícitos com filtragem trilinear e anisotropia máxima suportada pela GPU (em vez do valor fixo atual), o que corrige justamente a perda de definição em vistas rasantes e oblíquas.

4. **Reforço tonal por distância** — leve escurecimento/saturação da cor base nas duas áreas para que, à distância, elas continuem se distinguindo do estacionamento genérico vizinho.

## Detalhes técnicos

- `src/features/commercial-map/components/canvas/openGroundTextures.ts`:
  - `paintGrass` e `paintCompactedGravel` ganham uma passada inicial de manchas de baixa frequência (ruído fractal em escala de ~1/4 e ~1/2 do ladrilho) antes do grão fino; as bandas de corte de grama e as faixas de rolagem passam a ser mais largas e com contraste maior.
  - Ajuste de `tileWorldSize` (grama ~7,5; saibro ~9) e `baseColor` para `#8aa465` (grama) e `#b39a78` (saibro), com `roughness` mantida.
  - `getOpenGroundTexture`: `generateMipmaps = true`, `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter`.
  - Nova função para aplicar `anisotropy` a partir de `gl.capabilities.getMaxAnisotropy()` (mesmo padrão já usado em `ReferenceUnderlaySurface`).
- `CommercialMapCanvas.tsx` (`GenericEntityMesh`): usa `useThree` para obter `gl` e aplicar a anisotropia máxima ao clone da textura; nenhuma outra mudança de altura, offset de polígono ou lógica de estrada — a passagem das vias já corrigida permanece como está.
- Sem alterações em `officialReference2026.ts`, `parkAccessSpatialPlan*`, migrations ou RLS.

## Validação

- Typecheck.
- Playwright em `/mapa-comercial`: capturas em três distâncias (perto, média, visão geral do parque) e em ângulo rasante, confirmando que as duas áreas mantêm cor e textura coerentes e que as vias seguem visíveis por cima.
