## Problema

No menu Carrinhos Elétricos, ao rolar para baixo no mobile (Chrome/Safari), a tela "treme". A causa é um loop de feedback:

1. A barra do navegador mobile colapsa/expande durante o scroll, alterando `window.scrollY` em pequenas variações.
2. O hook `useScrollDirection` flipa `direction` de `down` ↔ `up` várias vezes por segundo (delta de apenas 8px).
3. A renderização condicional (`{showFloating && <FloatingPickupBar />}`) monta/desmonta o componente, o que reorganiza o layout e dispara novamente o `IntersectionObserver` do card original — voltando ao passo 1.
4. Três listeners simultâneos (`window`, `document` capture, container) amplificam o efeito.

## Correção proposta

### 1. `src/hooks/useScrollDirection.ts`
- Manter apenas UM listener (`window`, passivo).
- Aumentar `delta` padrão para `24px`.
- Adicionar `minTravel` (default 60px): só troca a direção depois de viajar essa distância acumulada no sentido oposto. Evita flip por micro-ajuste da address bar.
- Ignorar `scrollY` negativo (overscroll iOS).
- Não atualizar estado se `direction` e `scrollY` (arredondado) não mudaram — evita re-renders.

### 2. `src/pages/ElectricCartsPage.tsx`
- Substituir renderização condicional por renderização persistente com prop `visible`:
  ```tsx
  <FloatingPickupBar
    visible={showFloatingWithdrawalCard}
    onClick={openPickup}
    available={counts.disponivel}
    inUse={counts.em_uso}
  />
  ```
- Histerese: `scrollY > 240` para mostrar e voltar a esconder só quando `scrollY < 120`, evitando piscar no limiar.
- `IntersectionObserver`: usar `rootMargin: '-80px 0px 0px 0px'` e threshold único `0` para resposta estável, sem múltiplos breakpoints.
- Parâmetros do hook: `{ delta: 24, minTravel: 60, activateAfter: 200 }`.

### 3. `src/components/electric-carts/FloatingPickupBar.tsx`
- Aceitar prop `visible: boolean`.
- Sempre montado; visibilidade controlada por:
  - `opacity-0 -translate-y-3 pointer-events-none` quando oculto;
  - `opacity-100 translate-y-0 pointer-events-auto` quando visível;
  - `transition-[opacity,transform] duration-200 ease-out`;
  - `will-change: transform, opacity`.
- Mantém `position: fixed`, `z-40`, safe-area-inset.
- `aria-hidden={!visible}` e `tabIndex={visible ? 0 : -1}`.

### 4. CSS
- Adicionar `overscroll-behavior-y: contain` no wrapper raiz da página (`<div className="space-y-6 overscroll-contain">`) para reduzir o efeito da address bar mobile.

## Arquivos editados

- `src/hooks/useScrollDirection.ts`
- `src/pages/ElectricCartsPage.tsx`
- `src/components/electric-carts/FloatingPickupBar.tsx`

## Garantias

- Card original permanece igual; nada na frota, abas, autorizados, reservas, retirada ou devolução muda.
- A barra flutuante continua aparecendo ao subir e sumindo ao chegar próximo do topo, mas sem tremor e sem mount/unmount em loop.
- Sem impacto em outras páginas (alterações de hook são compatíveis com chamadas existentes via opções padrão).
