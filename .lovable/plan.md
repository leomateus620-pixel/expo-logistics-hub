# Correção do card operacional (abaixo da contagem oficial)

## Diagnóstico

O card `.fenasoja-countdown-ops-card` foi criado com fundo semi-transparente (`oklch(... / 0.92-0.96)`) somado a `backdrop-filter: blur()`. Como o card está dentro de um container claro da workspace do Cronograma, o blur amostra os pixels brancos do fundo e o gradiente translúcido navy vira um cinza-azulado quase branco — sumindo o texto branco e o efeito 3D.

## Correção (somente CSS, arquivo `src/styles/fenasoja-countdown.css`)

Reescrever a regra `.fenasoja-countdown-ops-card` (linhas ~862–890) para:

1. **Fundo totalmente opaco** na mesma família do hero (evita transparência sobre o container branco):
   - `background:` com radial gold sutil no canto superior direito + gradiente linear em `hsl(var(--fenasoja-hero-deep))` → `hsl(var(--fenasoja-hero-mid))` → `oklch(var(--brand-navy-800))`. Todos os stops **sem alfa**.
2. **Remover `backdrop-filter`** (não faz sentido com fundo opaco e é o causador da lavagem).
3. **Reforçar borda e sombra 3D**: borda dourada 0.32, `box-shadow` com `var(--elevation-4)` + linha dourada inferior + inset highlight/depth (mesma linguagem do hero, porém em altura menor).
4. **Grid sutil de profundidade** via `::after` já existente + novo `::before` com grid pattern leve mascarado (opcional para dar volume, sem chapar).
5. Ajustar `.fenasoja-countdown-progress-heading`, `.fenasoja-countdown-progress > p`, `.fenasoja-countdown-next-action small/em` e `.fenasoja-countdown-operation-metric small` para **cores com contraste ≥ 4.5:1** sobre o navy (subir opacidades de `0.62–0.68` → `0.82–0.9`; título eyebrow em `hsl(var(--fenasoja-hero-gold))`).
6. Ajustar `.fenasoja-countdown-progress-track` para track em `rgb(255 255 255 / 0.18)` (mais visível) mantendo o fill dourado.
7. Divisores verticais entre a coluna de progresso e a de operações: subir para `rgb(255 255 255 / 0.18)`.

## Fora de escopo

- Nenhuma alteração em `FenasojaCountdownHero.tsx` (marcação permanece).
- Sem mudança de dados, hooks ou rotas.
- Hero card (que já está correto) permanece intocado.

## Validação

Após a mudança, abrir `/cronograma-eventos` em desktop e mobile via Playwright, capturar screenshot do bloco abaixo do relógio e conferir:
- Fundo navy escuro sólido, sem lavagem branca.
- Textos "Preparação 2026—2028", "Próximo marco operacional", "Atrasadas", "Sem data" legíveis.
- Barra de progresso dourada visível sobre track escuro.
- Continuidade visual com o hero acima (mesma família de cor, mesma borda dourada).
