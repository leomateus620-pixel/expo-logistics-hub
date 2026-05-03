
## Objetivo
No menu **Carrinhos Elétricos**, redesenhar o cabeçalho de ações dando destaque máximo ao fluxo de **Retirada** com um card 3D Liquid Glass animado, adicionar busca por nome de autorizado dentro do diálogo de retirada e reorganizar os demais CTAs sem quebrar nenhum fluxo existente.

## Mudanças

### 1. Busca de autorizado no diálogo de Retirada
Arquivo: `src/pages/ElectricCartsPage.tsx` (aba "Autorizado" do diálogo de retirada).

- Substituir o `Select` simples por um **Combobox com busca** (padrão `Command` + `Popover`, já usado no projeto):
  - Input de busca filtra `sortedAuthorizations` por `member_name` e `committee_name_snapshot` (normalização sem acento, lowercase).
  - Mantém também os `members` internos abaixo, com seção e busca unificada.
  - Mantém badges de status (`liberado` / `pendente`) e a comissão.
- Comportamento de seleção e o resto do fluxo continuam idênticos (mesma lógica `auth:` / `userId`, `comissao`, `nome_externo`).

### 2. Hero "Retirada" — card 3D Liquid Glass com física
Arquivo: `src/pages/ElectricCartsPage.tsx` (substitui a barra atual de 3 botões).

Novo componente local `PickupHeroCard` (arquivo: `src/components/electric-carts/PickupHeroCard.tsx`):

- **Layout vertical, largura total** (`w-full`), altura confortável (`min-h-[140px] sm:min-h-[160px]`), `rounded-3xl`, ocupando da borda esquerda à direita do menu (acima das tabs).
- **Liquid Glass adaptativo ao projeto** (verde profundo + dourado, mesmas tokens `--primary`, `--accent`):
  - Fundo: `bg-gradient-to-br from-primary/25 via-primary/12 to-accent/15` + `backdrop-blur-2xl`.
  - Borda: `border border-primary/30` com `shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.55),inset_0_1px_0_rgba(255,255,255,0.18)]`.
  - 2 halos radiais animados (top-right primary, bottom-left accent) com `animate-halo-breath`.
  - Sheen diagonal e shimmer sweep contínuo (reuso de `animate-cart-shimmer`).
- **Efeito 3D com física (pointer tilt + spring)**:
  - `onPointerMove` calcula `rotateX/rotateY` (range ±8°) e `translateZ` em função da posição do cursor (parallax dos elementos internos: ícone Zap flutua mais, badge de contador menos).
  - Spring CSS: `transition: transform 320ms cubic-bezier(0.22, 1.4, 0.36, 1)` (overshoot leve = sensação elástica).
  - `onPointerLeave` faz "snap-back" suave ao centro.
  - `motion-reduce:transform-none` para acessibilidade.
  - `active:scale-[0.985]` e `transform-style: preserve-3d` no wrapper; ícone com `translate-z-8` simulado.
- **Conteúdo**:
  - Esquerda: ícone `Zap` em "pílula" verde brilhante 14×14 com glow, com pequeno indicador animado (`ping`) quando há ≥1 carrinho disponível.
  - Centro: título grande `Registrar Retirada` (uppercase tracking) + subtítulo dinâmico `{counts.disponivel} disponíveis · {counts.em_uso} em uso`.
  - Direita: chevron animado com `translate-x` no hover indicando ação.
- Card inteiro é o CTA (`role="button"`, `onClick={openPickup}`, foco visível, atalho `Enter/Space`).

### 3. Reordenação dos CTAs
- **Remover** o botão "Adicionar" do header.
- **Mover** o botão "Relatório" para **baixo** do hero, alinhado à direita, como botão `outline` discreto (`size="sm"`, ícone `FileText`).
- O fluxo de adicionar carrinho continua disponível por:
  - Botão "Adicionar Carrinho" já existente no **estado vazio** da grade.
  - Novo botão-ícone discreto dentro do `ElectricCartsFilters` (ícone `Plus` à direita do filtro de status), preservando 100% o fluxo (`setAddOpen(true)`).
- Nenhum estado, hook, mutation ou diálogo (`addOpen`, `pickupOpen`, `returnOpen`, `historyOpen`, `editOpen`) é alterado — apenas como são acionados.

### 4. Layout final do topo da página

```text
┌─────────────────────────────────────────────────────────────┐
│  Carrinhos Elétricos                                        │
│  Gerencie os carrinhos elétricos do evento                  │
├─────────────────────────────────────────────────────────────┤
│ ╔═══════════════════════════════════════════════════════╗   │
│ ║  ⚡   REGISTRAR RETIRADA                            ›  ║   │  ← Hero 3D
│ ║      6 disponíveis · 2 em uso                         ║   │     Liquid Glass
│ ╚═══════════════════════════════════════════════════════╝   │
│                                          [📄 Relatório]     │
├─────────────────────────────────────────────────────────────┤
│ [Frota] [Autorizados] [Reservas]                            │
└─────────────────────────────────────────────────────────────┘
```

## Garantias de não-quebra
- Mesmas funções (`openPickup`, `handlePickup`, `handleAdd`, `setAddOpen`, etc.) e mesmos diálogos são reutilizados — apenas o gatilho visual muda.
- Combobox de autorizados emite os mesmos valores (`auth:<id>` ou `<userId>`) processados no `onValueChange` atual.
- Nenhuma alteração em hooks, RPCs, tabelas ou edge functions.
- Tabs `Frota / Autorizados / Reservas` permanecem intactas.

## Detalhes técnicos
- Animações já disponíveis em `tailwind.config.ts` (`animate-halo-breath`, `animate-cart-shimmer`) — sem novas dependências.
- A "física" usa apenas CSS transforms + cubic-bezier com overshoot; nada de framer-motion.
- Acessibilidade: `aria-label`, foco visível com `ring-2 ring-primary/40`, suporte a `prefers-reduced-motion`.
- Mobile (393px): tilt desabilitado em touch (detecta `pointerType !== 'mouse'`), card mantém o brilho/shimmer e o `active:scale` para sensação tátil.
