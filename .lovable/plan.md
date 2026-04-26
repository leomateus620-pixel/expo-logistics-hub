# Corrigir chuva de grãos — fluida em desktop e mobile

## Diagnóstico

Analisando `SoybeanRain.tsx` e a integração no `FenasojaCountdown.tsx`, identifiquei **5 causas** para a chuva travada e densidade baixa:

### 1. Container 3D quebra o sizing do canvas
O wrapper aplica `[transform-style:preserve-3d] [transform:rotateX(1deg)]`, criando um contexto 3D que interfere no `getBoundingClientRect()` do canvas — frequentemente o canvas inicia com `width=0/height=0` e nunca redesenha.

### 2. `mix-blend-mode: screen` é caríssimo
Força recomposição GPU pixel-a-pixel contra o gradiente complexo do card a cada frame. Causa drops massivos de FPS, especialmente em mobile.

### 3. Spawn rate baixo + canvas inicia vazio
- `SPAWN_INTERVAL_MS = 220ms` → ~4-5 grãos/s
- Sem população inicial → leva ~8 segundos para o usuário ver chuva
- `MAX_GRAINS = 38` nunca é atingido visualmente

### 4. Gradientes radiais por grão por frame
`ctx.createRadialGradient()` rodando 2x por grão por frame = ~4.560 gradientes/s. Gargalo principal de CPU.

### 5. `dt` em frames, não em tempo real
Em telas 120Hz/144Hz causa stutter. Gravidade deveria ser px/s² independente de refresh rate.

---

## Plano

### A. Reescrever `SoybeanRain.tsx`

**1. Pré-renderizar sprites (offscreen canvas)** — 6 variações de grão renderizadas uma vez no mount, com gradiente + hilum + specular já compostos. Cada frame faz apenas `ctx.drawImage()` rotacionado — ~50x mais rápido.

**2. Aumentar densidade**:
- Desktop: `MAX_GRAINS = 55`, spawn a cada **90ms**
- Mobile (`<640px` ou `hardwareConcurrency<4`): `MAX_GRAINS = 32`, spawn a cada **130ms**
- **Pré-popular ~22 grãos** já em queda no mount → chuva começa "estabelecida"

**3. Remover `mix-blend-mode: screen`** — substituir por alpha normal com cor já dourada brilhante. Ganho de 2-3x FPS em mobile.

**4. Loop time-based**:
- `dt` em segundos (cap 0.05s)
- Gravidade: 380 px/s²
- Skip frame se `dt > 0.1s` (volta de background)

**5. Fix do sizing 3D**:
- `requestAnimationFrame` após mount para sizing inicial real
- `ResizeObserver` com debounce via rAF
- Retry em 100ms se width=0

### B. Ajustar `FenasojaCountdown.tsx`

- Remover dependência de `mixBlendMode` (movido para o componente)
- Garantir z-index correto do canvas (acima do bg, abaixo do conteúdo)
- Manter intacto o efeito 3D premium do card

### C. Capacidade inteligente

- Mobile detection via `matchMedia('(max-width: 640px)')`
- `hardwareConcurrency < 4` → modo econômico
- `prefers-reduced-motion` → mantém poucos grãos estáticos (já existe)

### D. Sway natural

- Cada grão com `swayPhase` próprio (oscilação senoidal individual)
- Wind global com lerp mais suave

---

## Resultado esperado

- **Desktop**: ~55 grãos visíveis, 60fps estável
- **Mobile**: ~32 grãos fluidos, 60fps
- **Início imediato**: chuva já estabelecida ao abrir o Dashboard
- **Fix do bug**: canvas dimensiona corretamente dentro do card 3D

## Arquivos modificados

- `src/components/dashboard/SoybeanRain.tsx` — reescrita completa (sprites + loop time-based + mobile-aware)
- `src/components/dashboard/FenasojaCountdown.tsx` — ajuste pontual de z-index do canvas