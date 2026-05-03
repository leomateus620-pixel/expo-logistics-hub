## Objetivo
Tornar o card "Registrar Retirada" mais compacto (principalmente no mobile 393px), mantendo a largura total e a identidade Liquid Glass 3D, além de melhorar o contraste das informações (disponíveis / em uso / título).

## Mudanças em `src/components/electric-carts/PickupHeroCard.tsx`

### 1. Altura/padding mais enxutos
- `min-h-[140px] sm:min-h-[160px]` → `min-h-[88px] sm:min-h-[112px]`.
- Padding: `px-5 sm:px-7 py-5 sm:py-6` → `px-4 sm:px-6 py-3.5 sm:py-4`.
- Gap interno: `gap-4 sm:gap-6` → `gap-3 sm:gap-4`.
- `rounded-3xl` → `rounded-2xl` (mais condizente com altura menor).

### 2. Ícone mais compacto
- Pílula do `Zap`: `w-16 h-16 sm:w-20 sm:h-20` → `w-12 h-12 sm:w-14 sm:h-14`.
- Ícone `Zap`: `w-8 h-8 sm:w-10 sm:h-10` → `w-6 h-6 sm:w-7 sm:h-7`.
- Mantém glow e indicador `ping`, ajustando a posição do badge.

### 3. Chevron mais discreto
- `w-11 h-11 sm:w-12 sm:h-12` → `w-9 h-9 sm:w-10 sm:h-10`.
- Ícone: `w-5 h-5 sm:w-6 sm:h-6` → `w-4 h-4 sm:w-5 sm:h-5`.

### 4. Tipografia compacta + melhor contraste
- Eyebrow "Toque para iniciar": remover no mobile (`hidden sm:block`) para ganhar altura; manter no desktop com `text-[11px]` e `text-primary` (mais sólido que `/80`).
- Título: `text-xl sm:text-3xl` → `text-base sm:text-xl`, mantendo `font-extrabold tracking-tight`.
- Subtítulo (contadores): trocar `text-muted-foreground` por `text-foreground/85` (alto contraste em ambos os temas) e usar **chips** ao invés de texto corrido para alta legibilidade:
  - Chip verde: `bg-success/15 text-success border border-success/30 px-2 py-0.5 rounded-full text-[11px] font-bold` → `{available} disponíveis`.
  - Chip âmbar: `bg-accent/20 text-accent-foreground dark:text-accent border border-accent/40 …` → `{inUse} em uso`.
- Layout das chips em `flex flex-wrap items-center gap-1.5 mt-1`.

### 5. Halos e shimmer
- Reduzir halos para combinar com altura menor:
  - `-top-16 -right-10 w-56 h-56` → `-top-10 -right-8 w-40 h-40`.
  - `-bottom-20 -left-12 w-60 h-60` → `-bottom-12 -left-8 w-44 h-44`.
- Manter shimmer e spotlight (ajustes só de tamanho).

### 6. Tilt 3D
- Reduzir levemente para não exagerar em card menor: `±6°/±5°` → `±4°/±3°`.
- Parallax dos elementos: `translateZ(40px / 24px / 32px)` → `translateZ(28px / 16px / 22px)`.

## Garantias
- Nenhuma alteração de props, fluxo, handlers ou layout externo (`ElectricCartsPage` permanece igual).
- Mantém acessibilidade (`role`, `aria-label`, foco visível, `motion-reduce`).
- Largura full mantida; apenas altura/peso visual diminuem.
- Contraste das chips aprovado nos temas claro/escuro pelas tokens `--success` e `--accent`.
