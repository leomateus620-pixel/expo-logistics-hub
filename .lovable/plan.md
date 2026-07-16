## Escopo
Refinar o card **Contagem Oficial** (`FenasojaCountdownHero.tsx` + `src/styles/fenasoja-countdown.css`) — hoje o bloco é visualmente denso, os quadrados do relógio parecem "cartões brancos genéricos" e o rodapé (Próximo Marco / Atrasadas / Sem Data) está grudado no mesmo card, competindo com a contagem.

## Diagnóstico
- Quadros do relógio em branco puro criam um contraste chapado sobre o azul e "quebram" a linguagem premium (parece template de contagem regressiva genérico).
- Texto de apoio "Cada decisão do cronograma converge para este marco institucional. Acompanhe a preparação em tempo real" é ruído — a proposta já se comunica pelo próprio relógio + eyebrow.
- Barra "Preparação 2026—2028 · 6% · Próximo Marco · Atrasadas · Sem Data" está costurada no mesmo `<header>`. Isso amontoa dois níveis de informação (institucional × operacional) num único card.

## Mudanças

**1. `src/components/cronograma-eventos/FenasojaCountdownHero.tsx`**
- Remover o parágrafo `fenasoja-countdown-description` (a frase pedida).
- Dividir a árvore em **dois containers irmãos**:
  - `<header class="fenasoja-countdown-hero">` — mantém topline, story ("Nossa próxima grande história começa em / FENASOJA 2028 / Faltam X dias…") e o relógio.
  - `<section class="fenasoja-countdown-ops">` — novo card, físico e independente, contendo o `fenasoja-countdown-progress` + `fenasoja-countdown-operations` (Próximo marco / Atrasadas / Sem data).
- Ambos ficam empilhados com `gap` real entre eles (visualmente destacados), preservando a mesma largura e alinhamento.

**2. `src/styles/fenasoja-countdown.css`**
- `.fenasoja-countdown-hero`:
  - Fundo em degradê profundo `oklch(var(--brand-navy-950)) → oklch(var(--brand-indigo-900))` + camada radial ouro/laranja sutil no canto do relógio.
  - `border: 1px solid oklch(var(--brand-gold-500)/0.18)`, `inset 0 1px 0 oklch(1 0 0 / 0.06)` (luz superior), sombra ambient + contato.
  - `backdrop-filter: blur(24px) saturate(1.35)`.
- `.fenasoja-countdown-clock`:
  - Container ganha "moldura de vidro" (glass escuro com borda dourada 0.12) para destacar o relógio como peça central.
- `.fenasoja-countdown-unit` (os quadrados):
  - Trocar o branco chapado por **placa 3D**: fundo `linear-gradient(180deg, oklch(var(--brand-cream)/0.98), oklch(var(--brand-cream)/0.88))`, `border: 1px solid oklch(var(--brand-gold-500)/0.35)`, `inset 0 1px 0 rgb(255 255 255 / 0.9)` (highlight superior) + `inset 0 -1px 0 oklch(var(--brand-navy-950)/0.12)` (sombra inferior interna), sombra externa de contato `0 8px 18px -10px oklch(var(--brand-navy-950)/0.55)`.
  - Números com `text-shadow: 0 1px 0 rgb(255 255 255 / 0.7), 0 -1px 0 oklch(var(--brand-navy-950)/0.15)` para simular relevo tipográfico.
  - Cor do valor: `oklch(var(--brand-navy-900))`; label unidade em `oklch(var(--brand-navy-900)/0.65)` com tracking wide.
  - Separador ":" opcional entre unidades usando pseudo-elemento (`::after`) só em `sm+`.
- `.fenasoja-countdown-value`:
  - Fonte tabular (`font-variant-numeric: tabular-nums`), `font-weight: 800`, tamanho responsivo (`clamp(2rem, 4.2vw, 3rem)`).
  - Contador de segundos ganha `transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)` sutil no tick (spring físico), respeitando `prefers-reduced-motion`.
- **Novo `.fenasoja-countdown-ops`** (segundo card, separado):
  - Mesma família visual (glass navy + borda dourada 0.14), porém mais baixo/horizontal.
  - `border-radius` idêntico ao hero, `margin-top: clamp(0.75rem, 1.5vw, 1.25rem)` para separação clara.
  - Divisórias verticais internas entre "Preparação", "Próximo marco", "Atrasadas", "Sem data" (`border-left: 1px solid oklch(1 0 0 / 0.08)` a partir do 2º item em md+).
  - Mantém as classes internas atuais (`.fenasoja-countdown-progress`, `.fenasoja-countdown-operations`, `.fenasoja-countdown-next-action`, `.fenasoja-countdown-operation-metric`) — só reposiciona e refina padding/gap.
- Remover regras órfãs da `.fenasoja-countdown-description`.

**3. Tipografia e ritmo**
- Eyebrow "Nossa próxima grande história começa em" com `letter-spacing: 0.22em`, cor `oklch(var(--brand-gold-500)/0.85)`.
- `FENASOJA 2028` mantém tamanho, mas ganha `text-shadow: 0 2px 0 rgb(0 0 0 / 0.35)` para volume; "2028" continua em ouro.
- "Faltam X dias" com número em `oklch(var(--brand-gold-500))` + peso 700.

**4. Responsivo / a11y**
- Em `mobile` (`data-presentation="mobile"`): relógio em 4 colunas compactas mantidas, ops card colapsa em 2 colunas (Próximo marco linha inteira + Atrasadas/Sem data lado a lado).
- `prefers-reduced-motion`: desliga a animação spring do tick de segundos e mantém apenas o valor atualizado.

## Fora de escopo
- Nenhum ajuste em rotas, hooks (`useLiveFenasojaCountdown`), summary de comandos, ou lógica de contagem.
- Nenhuma alteração em `CronogramaModuleShell` (barra superior já refinada).
- Sem novas dependências.

## Resultado esperado
Contagem oficial com sensação premium e material físico (placas cremosas com relevo, moldura de vidro, luz dourada), sem o parágrafo descritivo, e com o bloco operacional (Preparação + Próximo marco + Atrasadas + Sem data) claramente separado em um segundo card irmão — hierarquia institucional × operacional legível de imediato.
