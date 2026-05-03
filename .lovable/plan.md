## Plano de correção

Vou corrigir a lógica do card flutuante “Registrar Retirada” no menu Carrinhos Elétricos para que ele apareça de forma confiável no mobile e desktop quando o usuário estiver longe do topo e começar a rolar para cima.

## Diagnóstico provável

Pelo código atual, o card flutuante depende apenas de `window.scrollY` e de `direction === 'up'`. Ele não verifica se o card original ainda está visível e não tem uma ref/observador no CTA original. Isso pode falhar por alguns motivos:

- a rolagem real pode não estar sendo medida de forma robusta em Safari/iPhone;
- `scrollY` pode não refletir corretamente o container efetivo em alguns layouts;
- o estado visual pode ficar em `opacity-0`/fora da tela mesmo com o componente montado;
- não há `IntersectionObserver` para impedir duplicidade e confirmar que o card original saiu da área visível;
- o hook atual só escuta `window`, sem fallback para `document.scrollingElement` nem container explícito.

## Implementação proposta

### 1. Reforçar a detecção de scroll

Editar `src/hooks/useScrollDirection.ts` para suportar um alvo de scroll opcional:

- aceitar uma `ref` opcional de container;
- se a ref existir e for rolável, usar `ref.current.scrollTop`;
- caso contrário, usar `window.scrollY` com fallback para `document.documentElement.scrollTop` e `document.scrollingElement.scrollTop`;
- manter `lastScroll` em `useRef`;
- comparar com delta pequeno (`8px`) para evitar tremedeira;
- usar `requestAnimationFrame` e listener passivo;
- não recriar listener por estados de scroll.

### 2. Criar ref explícita da página e do card original

Em `src/pages/ElectricCartsPage.tsx`:

- importar `useRef`, `useEffect` e, se necessário, `useState` já existente;
- criar `scrollContainerRef` no wrapper principal da página;
- criar `originalPickupRef` ao redor do `PickupHeroCard`;
- passar `scrollContainerRef` ao hook como fallback preparado;
- manter o handler único `openPickup` para card original e flutuante.

### 3. Usar IntersectionObserver no card original

Ainda em `ElectricCartsPage.tsx`:

- observar o wrapper do `PickupHeroCard`;
- considerar o card original visível quando ele estiver intersectando a viewport/área útil;
- se o original estiver visível, forçar o flutuante a ficar oculto;
- isso garante que nunca apareçam dois CTAs “Registrar Retirada” ao mesmo tempo.

Regra final:

```ts
const MIN_SCROLL_TO_SHOW = 180;
const SCROLL_DELTA = 8;

const showFloatingWithdrawalCard =
  direction === 'up' &&
  scrollY > MIN_SCROLL_TO_SHOW &&
  !isOriginalPickupVisible;
```

### 4. Ajustar renderização do flutuante

Trocar o uso atual sempre-montado com `visible={showFloating}` por renderização condicional real:

```tsx
{showFloatingWithdrawalCard && (
  <FloatingPickupBar
    onClick={openPickup}
    available={counts.disponivel}
    inUse={counts.em_uso}
  />
)}
```

Isso evita casos em que o componente existe mas fica preso em `opacity-0`, `pointer-events-none` ou fora da viewport.

### 5. Ajustar o componente flutuante

Editar `src/components/electric-carts/FloatingPickupBar.tsx` para:

- remover a dependência da prop `visible`;
- usar `position: fixed` sempre;
- no mobile: `top: calc(env(safe-area-inset-top) + 12px)`, `left/right: 16px`, `z-40`;
- no desktop: respeitar a margem da sidebar e largura máxima do conteúdo quando possível;
- manter visual Liquid Glass premium, compacto e legível;
- usar animação leve de entrada: `fade-in + translateY`, 180–240ms;
- manter `role="button"`, teclado Enter/Espaço e `aria-label`;
- manter z-index abaixo de dialogs/sidebar (`z-50`) e acima da frota.

### 6. Logs de diagnóstico protegidos

Adicionar logs temporários apenas em desenvolvimento, protegidos por:

```ts
if (import.meta.env.DEV) { ... }
```

Os logs mostrarão `scrollY`, `direction`, `isOriginalPickupVisible` e `showFloatingWithdrawalCard`. Eles não aparecerão em produção. Se a validação pelo código ficar suficiente, deixarei os logs removidos ou completamente protegidos para não poluir o console do usuário.

## Garantias de fluxo

- O card original continua no topo da tela.
- O card flutuante só aparece quando o usuário sobe estando longe do topo.
- Ao chegar no topo, o flutuante some.
- O clique do card flutuante usa exatamente o mesmo `openPickup` do card original.
- Os contadores vêm da mesma fonte (`counts` derivado de `carts`).
- Não haverá dois cards “Registrar Retirada” simultâneos.
- Não serão alterados os fluxos de retirada, devolução, edição, filtros, abas, autorizados, reservas ou relatório.

## Validação após implementar

Depois da alteração, vou verificar:

- mobile: topo com card original e sem flutuante;
- rolagem para baixo: flutuante oculto;
- rolagem para cima no meio da lista: flutuante aparece;
- clique no flutuante: abre o mesmo modal de “Registrar Retirada”;
- retorno ao topo: flutuante some;
- desktop: alinhamento e largura máxima adequados;
- z-index: não passa por cima de dialogs ou menu lateral.