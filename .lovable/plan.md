

## Contagem regressiva 3D para Fenasoja no Dashboard

### Objetivo
Adicionar um **card de contagem regressiva** logo abaixo do cabeçalho do Dashboard ("Bom dia / data"), exibindo quanto tempo falta até a abertura oficial da **Fenasoja 2026 — 01/05/2026 00:00 (horário de Brasília, UTC-3)** com efeito 3D premium e responsividade total.

### Layout do card

```text
┌─────────────────────────────────────────────────────────┐
│  🌾  FENASOJA 2026                       28/04 → 09/05  │
│      Faltam 9 dias para a abertura oficial              │
│                                                         │
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐                       │
│   │ 09 │  │ 14 │  │ 32 │  │ 18 │                       │
│   │DIAS│  │HORA│  │ MIN│  │ SEG│                       │
│   └────┘  └────┘  └────┘  └────┘                       │
│                                                         │
│   ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  Contagem em tempo real        │
└─────────────────────────────────────────────────────────┘
```

- **Mobile (<640px):** 4 mini-blocos em uma linha (`grid-cols-4`), dígitos `text-2xl`
- **Desktop (≥640px):** mesmos 4 blocos maiores (`text-4xl`), card mais largo, glow dourado mais intenso

### Comportamento

- Alvo fixo: **2026-05-01T00:00:00-03:00** (Brasília)
- Atualiza a cada **1 segundo** via `setInterval` com `clearInterval` no unmount
- Calcula `diff = target - now` e quebra em `dias / horas / min / seg`
- Quando `diff ≤ 0`: troca o título para "🎉 A Fenasoja começou!" e mostra "Evento em andamento" (sem regressivos negativos)
- Texto dinâmico:
  - `> 1 dia`: "Faltam **N** dias para a Fenasoja"
  - `= 1 dia`: "Falta **1** dia para a Fenasoja"
  - `< 1 dia`: "Faltam poucas horas para a Fenasoja"
- Barra de progresso: percentual desde 01/01/2026 até 01/05/2026 (preenche dourado conforme aproxima)

### Estética 3D Premium (alinhada à identidade Liquid Glass)

**Container externo:**
- `perspective: 1200px` no wrapper
- `transform-style: preserve-3d` + `rotateX(1deg)` sutil em repouso
- Hover desktop: `translateY(-4px) rotateX(3deg) scale(1.01)` 400ms cubic-bezier
- Background: gradiente diagonal verde Fenasoja `#194019` → `#0F2A0F` com overlay dourado translúcido
- Borda: `border-image` gradiente dourado, ring duplo (interno gold 18% + externo 8%)
- Sombra em camadas:
  ```
  0 1px 2px rgba(0,0,0,0.1),
  0 12px 28px -8px hsl(var(--primary)/0.3),
  0 28px 56px -20px hsl(var(--gold)/0.45),
  inset 0 1px 0 hsl(var(--gold)/0.22)
  ```
- Camada de **shimmer diagonal** animada (reaproveita keyframe `shimmer-diagonal` já criado para EventCard)
- Pequeno emblema "🌾" (ou ícone `Sprout`/`CalendarHeart` do lucide) flutuando à esquerda com animação `gold-pulse`

**Mini-blocos de dígitos:**
- Cada bloco é um cubinho 3D: `rounded-xl`, fundo `bg-card/50 backdrop-blur-xl`, ring dourado interno
- Dígitos em fonte mono (`font-mono font-extrabold`), cor `text-gold`
- Efeito embossed: `text-shadow: 0 1px 0 rgba(0,0,0,0.4), 0 0 12px hsl(var(--gold)/0.35)`
- Transição suave ao mudar valor: `transition-all 250ms` (fade entre dígitos)
- Label abaixo (`DIAS / HORAS / MIN / SEG`) em `text-[10px] tracking-[0.2em] uppercase text-muted-foreground`

**Barra de progresso:**
- Trilho `bg-card/40 h-1.5 rounded-full` com fill em gradiente verde→dourado animado

### Acessibilidade & performance

- `aria-live="polite"` no texto principal (anuncia a cada minuto, não a cada segundo, para evitar spam de leitores de tela)
- Respeita `prefers-reduced-motion`: desativa shimmer/rotateX, mantém só a contagem
- `useMemo` no cálculo do alvo, `useEffect` com cleanup do interval
- Evita re-render do Dashboard inteiro: subcomponente isolado `<FenasojaCountdown />`

### Posicionamento

Inserir entre o header de saudação e o bloco "Acessos Rápidos" no `src/pages/Dashboard.tsx`:

```text
[Saudação + data]
[🆕 Card Contagem Regressiva 3D]   ← novo
[StatCards principais]
[Acessos Rápidos]
...
```

### Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/components/dashboard/FenasojaCountdown.tsx` | Novo | Componente isolado da contagem regressiva 3D, com hook interno de tick a 1s |
| `src/pages/Dashboard.tsx` | Edit | Importa e renderiza `<FenasojaCountdown />` logo abaixo do bloco de saudação |
| `tailwind.config.ts` | Edit (mínimo) | Reaproveita `shimmer-diagonal` e `gold-pulse` já existentes; adiciona `digit-flip` (fade 200ms) caso necessário |

Sem migração de banco. Sem dependências novas. Sem impacto em outros módulos.

### Critério de aceite

1. Card aparece logo abaixo da saudação no Dashboard, em mobile e desktop
2. Mostra "Faltam N dias para a Fenasoja" + 4 blocos (dias, horas, min, seg) atualizando em tempo real
3. Alvo é **01/05/2026 00:00 (UTC-3)** — não muda com fuso do navegador
4. Visual 3D com shimmer, sombras em camadas, pulse dourado e responsivo (mobile compacto / desktop amplo)
5. Após 01/05/2026, exibe mensagem celebratória sem números negativos
6. Respeita `prefers-reduced-motion`

