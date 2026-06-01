
## Objetivo

Converter os 11 cards grandes do `CommissionPortalPage` em **Dynamic Islands** compactos (pills horizontais), em estilo 3D Liquid Glass, que **expandem ao clique** revelando descrição + botão "Acessar". Mantém identidade visual da feira (verde profundo + dourado) e usa a mesma linguagem da `TransportDynamicIsland` já existente no sistema.

## Estado de repouso (collapsed) — "Dynamic Island"

Cada comissão vira uma pílula horizontal compacta:

```text
╭──────────────────────────────────────────╮
│ ◉  Logística            ● Ativa      ›   │
╰──────────────────────────────────────────╯
```

- Altura ~64px, raio 999px (pill), padding horizontal generoso.
- Ícone à esquerda em chip arredondado 40px com a cor de accent da comissão.
- Nome em peso bold, tracking apertado.
- Status pill mini à direita (Ativa/Restrita/Em breve) + chevron `›`.
- **3D liquid glass**: gradiente sutil da cor da comissão + `backdrop-blur-2xl`, borda dourada 1px, sombra dupla (elevação + brilho dourado interno), highlight superior `inset 0 1px 0 hsl(var(--gold)/0.25)`.
- Sem rotação 3D no hover (lição aprendida): apenas `translateY(-2px)` + sombra mais profunda + glow dourado seguindo cursor via `--mx/--my` (padrão já validado).
- Cor de accent da comissão aparece como **barra lateral esquerda de 4px** + leve halo no ícone — preserva identidade sem dominar.

## Estado expandido (clicked)

Ao clicar, a pílula expande **in-place** (mesma posição no grid, sem modal):

```text
╭──────────────────────────────────────────╮
│ ◉  Logística            ● Ativa      ⌄   │
│                                          │
│  Transportes, frota, carrinhos, agenda,  │
│  freguês e operações de mobilidade.      │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │        Acessar  →                  │  │
│  └────────────────────────────────────┘  │
╰──────────────────────────────────────────╯
```

- Mesma pílula cresce em altura com transição `height/border-radius` 280ms `cubic-bezier(0.22,1,0.36,1)` (curva já usada no sistema).
- Border-radius transita de `999px` → `1.5rem` (suaviza para card).
- Conteúdo expandido com fade+slide-up 180ms staggered (descrição, badge sensível se houver, botão).
- Chevron rotaciona `›` → `⌄`.
- Clicar fora ou novamente colapsa. Apenas **uma ilha expandida por vez** (estado controlado no `CommissionPortalPage`).
- `aria-expanded` + `role="button"` + suporte a teclado (Enter/Space para expandir, Esc para colapsar).
- Botão "Acessar" mantém o `onAccess` atual → navega para `/login/:slug`.

## Layout do grid

- Grid muda de cards quadrados para **lista de pílulas em 2 colunas** no desktop, 1 coluna no mobile:
  - `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`
- Pílulas ocupam altura mínima (~64px collapsed, ~210px expanded) → portal fica visualmente mais leve, "inteligente", scaneável.
- Card do **Administrador** segue o mesmo padrão de Dynamic Island, com accent dourado reforçado e ícone `ShieldCheck` (já é o que está no header — o card duplicado no final do grid pode ser removido para evitar redundância, mantendo apenas o do header como CTA primário).

## Mudanças por arquivo

### `src/components/commissions/CommissionCard.tsx` (rewrite)
- Vira `CommissionIsland`. Recebe `expanded: boolean` + `onToggle: () => void` + `onAccess`.
- Markup pill compacto sempre montado; bloco expandido renderizado com `aria-hidden` + altura animada.
- Mantém o `--mx/--my` glow via `requestAnimationFrame` (já validado, zero re-render).
- Sem `translateZ`, sem rotação 3D, sem `transform-style: preserve-3d`.

### `src/pages/commissions/CommissionPortalPage.tsx`
- Novo `useState<string | null>` `expandedSlug`.
- Handler `toggleSlug(slug)`: se igual → colapsa, senão expande.
- Handler `onAccess(slug)` chama `accessModule` apenas quando expandido (clique no botão interno) — clique na pílula em si só expande/colapsa.
- Grid trocado para `md:grid-cols-2 xl:grid-cols-3 gap-3`.
- Remove o `CommissionCard` extra do "Administrador" no fim do grid (mantém só o do header).
- `useEffect` para fechar com `Escape` global e clique fora (via `useRef` no container do grid).

### `src/index.css`
- Renomear/atualizar `.commission-card-3d` → adicionar variante `.commission-island`:
  - Base: `rounded-full`, `transition: border-radius 280ms, box-shadow 240ms, transform 240ms, background 240ms`.
  - `&[data-expanded="true"]`: `border-radius: 1.5rem`.
  - Sombra liquid glass: `0 1px 0 hsl(var(--gold)/0.22) inset, 0 10px 24px -12px hsl(var(--primary)/0.55), 0 30px 60px -28px hsl(var(--gold)/0.35)`.
  - Hover: `translateY(-2px)` + sombra reforçada.
  - `prefers-reduced-motion`: desliga transição de transform/border-radius (mantém color/shadow).
- Manter `.commission-card-glow` (cursor follow) já existente.

## Acessibilidade & UX

- Toda pílula é `<button>` (não `<article>`) → semântica correta de "expansível clicável".
- Botão interno "Acessar" usa `stopPropagation` para não colapsar a ilha.
- Foco visível com `focus-ring` dourado (token existente).
- Status pill e badge sensível ficam visíveis no estado **collapsed** também (informação crítica sem precisar expandir).
- Sem mudanças em registry, hooks, rotas, capabilities, ou lógica de negócio.

## Resultado esperado

- Portal compacto, scaneável, com sensação Apple Dynamic Island.
- Cores das comissões preservadas como accent, não como fundo dominante.
- Identidade Liquid Glass premium consistente com `TransportDynamicIsland` e o restante do sistema.
- Performance estável (sem re-render em hover, sem 3D pesado).
