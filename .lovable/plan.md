## Diagnóstico das últimas 2 merges

**PR #3 — `Enriquece escopo operacional das comissões`** (2b3f1a9)
Mexeu em conteúdo/registry/menus. Sem impacto visual no card.

**PR #4 — `Melhora visual 3D nos cards do Portal das Comissões`** (6dae369)
Onde está o problema. Tudo que foi adicionado é **CSS estático**:
- `.commission-card-3d` aplica um `rotateX(5deg) rotateY(-4deg)` fixo só no `:hover` — o card "pula" para uma pose única e volta. Não há resposta ao cursor, não há paralaxe real, não há sensação de massa.
- O "brilho" é um `::before` com gradiente fixo — não acompanha o mouse.
- O `commission-card-orbit` é só duas linhas estáticas no topo/direita.
- O `commission-integration-link` (fio dourado entre cards) é decoração 2D — não é 3D.
- `translateZ(22px)` em todos os filhos é uma única camada — sem hierarquia de profundidade entre ícone, título, CTA.

Resultado: parece "card com hover bonitinho", não premium 3D com física. Genérico — qualquer template Tailwind faz isso.

## Referência interna a seguir

`src/components/dashboard/Metric3DCard.tsx` é exatamente o efeito premium que o usuário quer replicar. Ele usa:

1. Wrapper com `perspective: 1400px`.
2. `onMouseMove` calcula posição relativa (`px`, `py`) e aplica `rotateX/rotateY` proporcional ao cursor (não estático).
3. Radial-gradient de glow que segue o cursor: `radial-gradient(60% 60% at ${mx}% ${my}%, ...)`.
4. Camadas com `translateZ` diferentes (header 15px, ícone 20px, conteúdo 8px) → paralaxe real.
5. `box-shadow` muda de intensidade entre repouso e hover.
6. Easing `cubic-bezier(0.22,1,0.36,1)` curto (280ms) — sensação de mola.
7. `motion-reduce` desliga tudo.
8. Pose de repouso leve (`rotateX(2deg) rotateY(-1deg)`) — o card já "vive" parado.

## O que vou construir

Refatorar `src/components/commissions/CommissionCard.tsx` para um card interativo 3D com física, mantendo a identidade verde+dourado e a estrutura visual atual (badge de status, ícone, título, descrição, badge "sensível", CTA, conector dourado entre cards).

### Comportamento

- Wrapper `[perspective:1400px]`.
- Estado `tilt` com `{ x, y, mx, my, hover }` via `useState` + `onMouseMove` (mesmo padrão do Metric3DCard, faixa de tilt um pouco maior — ~12° — porque o card é maior).
- Em repouso: micro-pose `rotateX(2deg) rotateY(-2deg)` + flutuação sutil opcional via `@keyframes` (1 vez a cada 6s, leve).
- Em hover: tilt segue cursor; glow dourado/verde radial segue cursor; sombra "decola" (eleva no eixo Z) e fica mais profunda.
- Em `mousedown`/`active`: leve compressão (`scale(0.985) translateZ(-4px)`) para feedback físico de toque.
- Em `mouseleave`: transição de retorno mais lenta (~520ms cubic-bezier suave) para parecer mola assentando.

### Camadas de paralaxe (translateZ)

- Sombra base do gradiente: `0px`
- Halo radial seguindo cursor: `12px`
- Badge de status + conteúdo de texto: `26px`
- Título: `34px`
- Ícone do módulo: `48px` (mais pra frente, com sombra própria projetada)
- Botão CTA: `30px` com brilho que varre no hover

### Visual

- Mantém superfície liquid-glass verde existente (gradiente do registry no header), borda fina dourada que ganha intensidade com o cursor.
- Reflexo especular fino que orbita no sentido do cursor (linear-gradient diagonal cuja posição depende de `mx/my`).
- Sombra de chão sob o card aumenta quando o card "decola" (translateY/translateZ negativos da sombra).
- Conector dourado (`commission-integration-link`) preservado mas com pulso sincronizado.

### Acessibilidade / performance

- Tudo dentro de `prefers-reduced-motion: reduce` desliga rotação e fica só com hover sutil de elevação.
- Em touch (`@media (hover: none)`) desliga `onMouseMove` (não há cursor), mantém a pose de repouso + tap feedback.
- `will-change: transform` apenas durante hover (evita custo em idle).

### Limpeza do CSS

Em `src/index.css`, remover o tilt estático de `.commission-card-3d:hover` (linhas 464–478) e a regra `translateZ(22px)` chapada em todos os filhos. O tilt passa a ser controlado por inline style no componente. Mantém: superfície base, borda, sombra de repouso, `.commission-icon-3d` (servirá como base do ícone com sombra), `.commission-action-button`, `.commission-card-orbit` (reaproveitado como linha especular dinâmica), `.commission-integration-link` (intacto), dark mode, `prefers-reduced-motion`.

## Arquivos afetados

- `src/components/commissions/CommissionCard.tsx` — reescrita do componente (tilt via state, mousemove, camadas translateZ, glow dinâmico).
- `src/index.css` — remover o hover-tilt estático e o translateZ-em-todos-os-filhos; ajustar transições de retorno; adicionar keyframe sutil de "respiração" para o card em repouso.
- Nenhuma mudança em `CommissionPortalPage.tsx`, registry ou rotas.

## Fora de escopo

- Sem mudanças no admin card, no header do portal, no login ou nos placeholders internos das comissões.
- Sem novas libs (sem framer-motion / three) — JS puro + CSS, mesmo padrão do Metric3DCard.
- Sem alterar a paleta verde/dourado ou a tipografia.
