## Problema

O efeito atual do `CommissionCard` está pesado: tilt de até 12°, lift de 16px + translateZ, paralaxe forte (ícone a 48px, título a 34px+12px), reflexo especular varrendo e sombra de chão expandindo. Resultado: o card deforma demais, o ícone "salta" para fora do header, a descrição parece flutuar separada do corpo e o cartão perde a forma estável de superfície institucional.

## Objetivo

Manter a sensação 3D premium com física real (cursor-aware), mas suave — o card deve permanecer com a mesma silhueta e proporções em repouso e em hover, sem deslocamentos perceptíveis de camadas. Descrições, título e CTA precisam ficar nítidos, alinhados e sem "voar".

## Ajustes em `src/components/commissions/CommissionCard.tsx`

Tilt e movimento (mais discreto):
- `MAX_TILT`: 12 → **4°** (rotação muito sutil que acompanha o cursor).
- Pose de repouso: `rx 2, ry -2` → **`rx 1, ry -1`**.
- `lift` no hover: 16px → **4px** (quase imperceptível, só dá sensação de elevação).
- `pressZ` no active: -6 → **-2**.
- Remover o `scale(0.987)` no pressed (mantém forma).

Paralaxe (achatar para preservar a forma):
- Header (ícone + status): `translateZ(26)` → **`6`**.
- Ícone: `translateZ(48) + rotateX/Y(-tilt*0.25)` → **`translateZ(10)`** sem contra-rotação (fica colado no header, sem saltar).
- Corpo (título/descrição/CTA wrapper): `translateZ(26)` → **`4`**.
- Título: remover o `translateZ(12)` extra.
- CTA: `translateZ(14)` → **`2`**.
- Halo radial: `translateZ(12)` → **`1`** e reduzir opacidade (gold 0.32 → **0.14**, primary 0.22 → **0.10**).
- Reflexo especular: **remover** o layer (`translateZ(18)` + linear-gradient varrendo). Era o efeito mais agressivo; sai por completo.
- Sombra de chão: largura 74→88% e opacidade 0.28→0.55 viram **78→84%** e **0.22→0.32** (variação mínima).
- Base de cor (`accentClass`): mantém `translateZ(2)`.
- Linha dourada inferior: remover `translateZ(20)` (fica em 0, colada na borda).

Transições:
- Hover: 140ms → **180ms** mais suave.
- Retorno (mouseleave): 560ms → **420ms** com mesmo easing.

Acessibilidade/performance: mantém `prefers-reduced-motion` (sem rotação), `@media (hover: none)` (sem mousemove), `will-change` apenas em hover. Sem novas libs.

## `src/index.css`

Sem mudanças estruturais. Confirmar que `.commission-card-3d` continua sem `transform`/`transition` próprios (controlados inline), e que o `:hover` apenas reforça borda dourada e box-shadow — sem rotação CSS competindo com o JS.

## Fora de escopo

- Nada de novo no registry, portal, admin, login, placeholders.
- Sem mudar paleta, tipografia, badge de status, conector dourado entre cards, ou estrutura do JSX.
- Apenas atenuar valores numéricos e remover o layer de reflexo especular.

## Resultado esperado

Card mantém forma, proporção e legibilidade da descrição em qualquer posição do cursor. O 3D vira um "respiro" de profundidade + glow dourado suave seguindo o mouse + leve elevação, sem deformação visível das camadas.
