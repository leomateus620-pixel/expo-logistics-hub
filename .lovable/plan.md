

## Refinar identidade do menu "Eventos Fenasoja" + cards 3D premium

### 1. Trocar ícone do menu (sidebar + cabeçalho da página)

Substituir `Sparkles` (estrela cintilante, percebida como "emoji") por **`CalendarStar`** ou — mais profissional — **`CalendarCheck2`** combinado com refinamento visual. Após análise da identidade Fenasoja (institucional, programação oficial), o ícone escolhido é **`CalendarCheck2`** (calendário com check), que comunica "agenda institucional confirmada" de forma sóbria e corporativa.

| Local | Antes | Depois |
|---|---|---|
| `Sidebar.tsx` (item de menu) | `Sparkles` | `CalendarCheck2` |
| `FenasojaEventsPage.tsx` (badge do header) | `Sparkles` em pílula gold | `CalendarCheck2` em pílula com gradiente verde→dourado, ring duplo |
| Empty state | `Sparkles` | `CalendarCheck2` (mesmo tratamento glass premium) |
| `EventCard.tsx` (título) | `Sparkles` ao lado do nome | **Removido** — substituído por barra dourada lateral mais espessa + número do evento (#01, #02) em mono dourado |

### 2. Cards 3D premium com profundidade real

Aprimorar `EventCard.tsx` com técnicas modernas de profundidade:

**Camadas de profundidade (3D real):**
- `perspective: 1200px` no container pai dos cards
- Cada card com `transform-style: preserve-3d` + `rotateX(0.5deg)` sutil em repouso
- **Hover desktop:** `translateY(-6px) rotateX(2deg) scale(1.01)` com transição `cubic-bezier(0.25, 0.46, 0.45, 0.94)` 400ms
- **Active mobile:** `scale(0.985)` + reduce shadow (feedback tátil)

**Sistema de sombras em camadas (depth shadows):**
```
shadow base:    0 1px 2px rgba(0,0,0,0.08)
shadow midground: 0 8px 20px -8px hsl(var(--primary)/0.15)
shadow gold glow: 0 24px 48px -16px hsl(var(--gold)/0.35)
inner highlight: inset 0 1px 0 hsl(var(--gold)/0.18)
```
No hover, todas as sombras se intensificam suavemente; o glow dourado expande para 60px.

**Gradientes e textura premium:**
- Background: `linear-gradient(135deg, hsl(var(--primary)/0.08) 0%, hsl(var(--card)/0.7) 45%, transparent 100%)`
- Camada de brilho diagonal animada (shimmer) que cruza o card a cada hover (~1.2s)
- Borda com gradient stroke: `border-image: linear-gradient(135deg, hsl(var(--gold)/0.4), transparent 60%, hsl(var(--gold)/0.2))`
- Stripe lateral dourada **espessada de 3px → 5px** com gradient vertical e blur sutil (efeito "luz emanando")

**Tipografia em relevo:**
- Hora principal: `text-3xl font-mono font-bold` com `text-shadow: 0 1px 0 rgba(0,0,0,0.2)` (efeito embossed sutil)
- Título: drop-shadow leve dourado em hover

**Badges 3D:**
- Badge de turno (Manhã/Tarde/Noite) ganha gradient real + sombra interna + ring dourado
- Ícone do turno com micro-animação: `Sun` rotaciona lentamente, `Sunset` desliza, `Moon` pulsa

### 3. Animações cinematográficas

**Entrada da lista (orquestração):**
- Substituir `animate-fade-in` simples por animação composta:
  - `opacity 0 → 1` (300ms)
  - `translateY(24px) → 0` (450ms cubic-bezier)
  - `rotateX(-8deg) → 0` (450ms) — efeito "virando para o usuário"
  - `scale(0.96) → 1` (350ms)
- Stagger 70ms entre cards (mantém percepção de fluidez sem demora)

**Mudança de dia (chips):**
- Ao clicar em outro dia: cards atuais saem com `animate-fade-out + translateY(-12px) + rotateX(6deg)` (200ms)
- Novos cards entram pela animação acima — sensação de "carrossel 3D"

**Chips de dia:**
- Chip ativo ganha `scale(1.06)` + glow dourado pulsante sutil
- Hover em chip inativo: `translateY(-2px) rotateX(4deg)` micro-3D

**Hover interativo nos cards:**
- Botões de ação (Editar/Excluir) deslizam de `opacity 0 translateY(8px)` para `opacity 1 translateY(0)` no hover (desktop). Em mobile permanecem visíveis.
- Highlight gradient cruza diagonalmente o card uma vez (shimmer).

### 4. Definir keyframes globais necessários

Adicionar em `tailwind.config.ts` (extend keyframes):
- `card-enter-3d` — combinação opacity/translateY/rotateX/scale
- `shimmer-diagonal` — gradiente translucido cruzando o card
- `gold-pulse` — sombra dourada pulsante sutil para o chip ativo

### 5. Acessibilidade & performance

- Respeitar `prefers-reduced-motion`: animações 3D viram fade simples
- Usar `will-change: transform` somente durante hover (toggle via classe)
- Animações restritas a `transform`/`opacity` (GPU) — sem layout thrashing

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/Sidebar.tsx` | Trocar `Sparkles` → `CalendarCheck2` no item "Eventos Fenasoja" |
| `src/pages/FenasojaEventsPage.tsx` | Trocar `Sparkles` → `CalendarCheck2` no header e empty state; aplicar `perspective` no wrapper da lista; refinar gradiente do ícone do header |
| `src/components/fenasoja/EventCard.tsx` | Rewrite visual: remover `Sparkles`, adicionar stripe 5px, sombras em camadas, hover 3D, shimmer, badges com gradient, micro-animação no ícone do turno |
| `tailwind.config.ts` | Adicionar keyframes `card-enter-3d`, `shimmer-diagonal`, `gold-pulse` |

### Critério de aceite

1. Ícone do menu lateral troca de "estrelinha" para um ícone calendário institucional sóbrio (`CalendarCheck2`)
2. Página Eventos Fenasoja reflete o mesmo ícone no header e empty state
3. Cards reagem ao hover com efeito 3D real (perspectiva + sombras em camadas + shimmer)
4. Entrada dos cards é cinematográfica e escalonada
5. Mobile mantém feedback tátil (scale + sombra) sem quebrar performance
6. `prefers-reduced-motion` desativa as animações 3D

