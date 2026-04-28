## Objetivo

Harmonizar visualmente o menu **Carrinhos Elétricos** elevando dois pontos:

1. **Card "Em uso"** ganha destaque premium com animação leve (pulso/shimmer sutil), reforçando que aquele carrinho está ativo.
2. **Barra de filtros** (busca + Todos/Disponíveis/Em uso) ganha tratamento Liquid Glass igual ao dos cards, criando coesão visual.

Nenhuma lógica de negócio é alterada — apenas estilização e micro-animações GPU-aceleradas.

---

## Mudanças

### 1. Card "Em uso" — destaque premium animado
Arquivo: `src/components/electric-carts/ElectricCartCard.tsx`

- **Borda viva animada**: anel sutil em `hsl(var(--accent))` com `animate-pulse` lento (3s) apenas no estado `em_uso`, usando `ring-1 ring-accent/40` + glow externo.
- **Halo intensificado**: o radial gradient atual de accent ganha um segundo halo inferior-esquerdo (verde profundo) e opacidade 70% para profundidade real.
- **Shimmer leve**: faixa diagonal translúcida (`bg-gradient-to-r from-transparent via-white/8 to-transparent`) varrendo o card a cada ~6s via keyframe novo `cart-shimmer` — performático, GPU-only (transform: translateX).
- **Badge "EM USO" pulsante**: pequeno indicador no header (dot verde com `animate-pulse`) ao lado do código do carrinho, substituindo a sensação estática.
- **Botão Devolver**: mantém destaque atual, mas ganha micro hover com brilho interno animado (gradient shift sutil).
- Cards "Disponível" e "Manutenção" permanecem visualmente calmos (sem animação) para que o "Em uso" seja o foco.

### 2. Filtros harmonizados (Liquid Glass)
Arquivo: `src/components/electric-carts/ElectricCartsFilters.tsx`

- Envolver busca + segmented control em um **container único** com a mesma linguagem dos cards:
  - `rounded-2xl border border-border/40`
  - `bg-gradient-to-br from-card/85 via-card/65 to-card/45 backdrop-blur-2xl`
  - `shadow-[0_8px_32px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]`
  - Halo radial decorativo no canto (z-0) igual aos cards.
- **Input de busca**: fundo translúcido (`bg-background/40 backdrop-blur-sm`), borda suave, ícone com leve glow no focus.
- **Segmented control**: pílulas com `transform-gpu`, item ativo ganha gradient `from-primary to-primary/85` + `shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4)]` (mesma sombra dos botões dos cards). Contadores em chip translúcido.
- Transição suave (`transition-all duration-300`) ao trocar filtro.

### 3. Keyframe global
Arquivo: `tailwind.config.ts`

Adicionar animação `cart-shimmer` (translateX -120% → 220%, 6s ease-in-out infinite) e expor como `animate-cart-shimmer`. Reutilizável caso outros módulos queiram o mesmo efeito futuramente.

---

## Detalhes Técnicos

```text
ElectricCartCard (em_uso)
├── ring-1 ring-accent/40 + animate-pulse lento (3s)
├── halo top-right (accent) + halo bottom-left (primary/20)
├── overlay shimmer absoluto (animate-cart-shimmer, pointer-events-none)
├── header: dot verde animate-pulse + código
└── botão Devolver com gradient hover

ElectricCartsFilters (novo wrapper)
└── glass container
    ├── Input busca (bg-background/40 + ícone)
    └── Segmented (pílulas com gradient ativo + chip de contagem)
```

- Sem novas dependências.
- Sem mudanças em hooks, banco ou rotas.
- Acessibilidade preservada (contrastes, focus rings, `aria-label`).
- Performance: animações usam `transform`/`opacity` (GPU), respeitam `prefers-reduced-motion` via Tailwind `motion-safe:`.

## Arquivos afetados

- `src/components/electric-carts/ElectricCartCard.tsx` — destaque + animação no estado em_uso.
- `src/components/electric-carts/ElectricCartsFilters.tsx` — redesenho Liquid Glass.
- `tailwind.config.ts` — keyframe `cart-shimmer`.
