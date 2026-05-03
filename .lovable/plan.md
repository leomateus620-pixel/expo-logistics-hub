## Objetivo

Adicionar comportamento sticky inteligente ao card "Registrar Retirada" no menu Carrinhos Elétricos: o card original continua no topo, e quando o usuário rola para baixo e depois sobe, uma versão flutuante aparece suavemente no topo. Reutiliza o mesmo handler `openPickup` — sem fluxo paralelo.

## Arquivos

### 1. Novo: `src/hooks/useScrollDirection.ts`

Hook leve para detectar direção de scroll com throttling via `requestAnimationFrame`.

- Escuta `window.scroll` (passive).
- Mantém `lastY` em ref; só atualiza estado se `Math.abs(currentY - lastY) >= delta` (default 10px).
- Retorna `{ direction: 'up' | 'down' | null, scrollY: number }`.
- `direction` só vira `'up'` após o threshold mínimo de página (`activateAfter`, default 140px).
- Desmonta listener ao unmount.

Assinatura:
```ts
useScrollDirection({ delta?: number; activateAfter?: number }): {
  direction: 'up' | 'down' | null;
  scrollY: number;
}
```

### 2. Novo: `src/components/electric-carts/FloatingPickupBar.tsx`

Versão **compacta** (não 3D, sem tilt) do CTA, otimizada para sticky.

- Recebe `{ visible, onClick, available, inUse }`.
- Wrapper `fixed top-0 left-0 right-0 z-40` com `pt-[env(safe-area-inset-top)]` e `px-4 sm:px-6 max-w-[var(--content-max,1200px)] mx-auto`.
- Container interno: rounded-2xl, `bg-background/80 backdrop-blur-xl`, borda `border-primary/30`, sombra suave (`shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.45)]`), altura `h-14`.
- Conteúdo (linha única): pílula verde com `Zap` (w-9 h-9) + título "Registrar Retirada" (`text-sm font-bold`) + chips compactas `{available} disp` / `{inUse} em uso` (esconde chip "em uso" no mobile se não couber via `hidden xs:inline-flex` — usa breakpoint sm) + chevron à direita.
- Animação:
  - Quando `visible`: classes `translate-y-0 opacity-100`.
  - Quando hidden: `-translate-y-[120%] opacity-0 pointer-events-none`.
  - Transição: `transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]`.
  - `motion-reduce:transition-none`.
- Acessibilidade: `role="button"`, `aria-label`, `tabIndex={0}`, Enter/Space.
- Z-index: 40 (acima da lista, abaixo de Dialog `z-50` e Sidebar/Drawer).

### 3. Editar: `src/pages/ElectricCartsPage.tsx`

- Importar `useScrollDirection` e `FloatingPickupBar`.
- Logo após declarar `openPickup`, calcular:
  ```ts
  const { direction, scrollY } = useScrollDirection({ delta: 10, activateAfter: 160 });
  const showFloating = direction === 'up' && scrollY > 160;
  ```
- Renderizar `<FloatingPickupBar visible={showFloating} onClick={openPickup} available={counts.disponivel} inUse={counts.em_uso} />` no topo do JSX (antes do `<div className="space-y-6">`), de modo que fique sempre montado e apenas alterne classes (sem desmontar — evita flicker).
- Nenhuma alteração no `PickupHeroCard` original nem em outros cards/botões.

## Lógica de Scroll (detalhe)

```text
scrollY < 160               → showFloating = false (só card original)
scrollY >= 160 && down      → showFloating = false (sai do caminho)
scrollY >= 160 && up        → showFloating = true  (aparece flutuante)
volta a scrollY < ~80       → showFloating = false (some, evita duplicidade)
```

Threshold de delta (10px) impede flicker em pequenos toques. `requestAnimationFrame` agrupa updates para 1 setState por frame.

## Garantias

- **Sem fluxo paralelo**: `FloatingPickupBar.onClick === openPickup` (mesmo handler do card original).
- **Sem duplicidade visual**: o flutuante só monta visualmente quando `scrollY > 160`, então no topo só existe o original.
- **Contadores sincronizados**: lê de `counts` derivado de `carts` (mesma fonte do hero).
- **Safe-area iPhone**: `pt-[env(safe-area-inset-top)]`.
- **Z-index controlado**: 40 (Dialogs continuam em 50; sidebar mobile permanece acima).
- **Performance**: rAF + delta threshold; nenhum re-render da lista (estado fica isolado na page).
- **Reduced motion**: respeitado via `motion-reduce`.
- **Estados vazios/loading/permissão**: o bar só usa `counts` já existentes; se a página não renderiza (CapabilityGuard), o bar também não — porque está dentro do componente.
- Nada do `PickupHeroCard` 3D, filtros, abas, botão Relatório, dialogs ou hooks é tocado.
