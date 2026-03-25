

# Transições de Página + Otimização do Login

## Escopo 1 — Transições entre páginas

### Abordagem
Criar um componente `PageTransition` que envolve o conteúdo de cada rota dentro do `Layout`, aplicando uma animação CSS sutil de fade + micro-slide vertical (opacity + translateY) na montagem. Sem biblioteca extra — apenas CSS + React key baseado na rota.

### Implementação

**1. `src/components/PageTransition.tsx`** (novo)
- Componente wrapper que usa `useLocation().pathname` como `key` para forçar remount a cada navegação.
- Aplica classe CSS de animação `animate-page-in` na montagem.
- Respeita `prefers-reduced-motion` (sem animação quando ativado).

**2. `src/index.css`** — adicionar keyframe
```css
@keyframes page-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-page-in {
  animation: page-in 220ms cubic-bezier(0.25, 0.1, 0.25, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .animate-page-in { animation: none; }
}
```

**3. `src/components/Layout.tsx`**
- Envolver `{children}` com `<PageTransition>` dentro do `<main>`.

Resultado: transição leve de 220ms, GPU-friendly (opacity + transform), sem reflow.

---

## Escopo 2 — Otimização da tela de login

### Problemas identificados
1. Imagens PNG importadas via Vite como módulo JS — carregam com o bundle, bloqueiam render.
2. Background usa `<img>` tag com `absolute inset-0` — funcional mas sem loading progressivo.
3. `min-h-screen` no container pode causar saltos no mobile (100vh vs dvh).
4. `backdrop-filter: blur(28px)` nos inputs é desnecessário (já tem no card pai) — custo extra de compositing.

### Implementação

**1. `src/pages/LoginPage.tsx`** — refatorar background
- Trocar `<img>` tags por CSS `background-image` no container raiz com `bg-cover bg-center bg-fixed bg-no-repeat`.
- Usar `min-h-[100dvh]` em vez de `min-h-screen`.
- Adicionar estado `imageLoaded` com `<link rel="preload">` ou `new Image()` para fade-in progressivo do fundo.
- Remover `backdrop-filter` dos inputs (herdam do card).
- Manter card com `will-change: transform` para isolar compositing.

**2. Estratégia de carregamento progressivo**
- Container inicia com background color sólido escuro (cor dominante da imagem).
- Ao carregar a imagem via JS `new Image()`, aplica fade-in do background com transição CSS `opacity 500ms`.
- Resultado: formulário visível instantaneamente, imagem aparece suavemente.

**3. Estabilidade visual mobile**
- Container: `fixed inset-0` em vez de `min-h-[100dvh]` para o wrapper do background — imune a barras do navegador.
- Conteúdo: `min-h-[100dvh]` com `overflow-y-auto` para o container do formulário.
- Remover `overflow-hidden` do container pai (causa corte em teclado virtual).

---

## Arquivos a editar
1. `src/components/PageTransition.tsx` — **criar** (wrapper de transição)
2. `src/components/Layout.tsx` — envolver children com PageTransition
3. `src/index.css` — adicionar keyframe `page-in`
4. `src/pages/LoginPage.tsx` — refatorar background para CSS + loading progressivo + dvh

## Riscos mitigados
- Nenhuma lógica de negócio alterada
- Nenhum componente de modal/dialog tocado
- Animação usa apenas `opacity` + `transform` (GPU)
- Fallback automático para `prefers-reduced-motion`

