## Dashboard Premium — Chuva de Soja Física + Cards 3D Inteligentes

### Objetivos
1. **Countdown Fenasoja**: substituir o ícone `Sprout` por um **grão de soja dourado** customizado e adicionar **chuva contínua de grãos** com física real (gravidade, sway, rotação 3D, colisão com a borda inferior do card)
2. **Stat Cards (Veículos / Carrinhos / Transportes / Tarefas)**: transformar em cards **3D Liquid Glass** com profundidade real, parallax no hover, ícones mais expressivos e **conexão inteligente** mostrando o status real linkado
3. Performance preservada (GPU-only, `motion-reduce` respeitado, sem re-render do React por frame)

---

### Parte 1 — `FenasojaCountdown.tsx` (refator visual profundo)

**1.1 Grão de soja dourado customizado** — substituir `<Sprout />` no header por um SVG inline `<SoybeanGrain />`:
- Forma elíptica orgânica (rx=14, ry=10) com **gradiente radial dourado** (`#FFE38A` → `#F2C94C` → `#A77B1F`)
- **Hilum** (mancha lateral característica do grão) em tom mais escuro
- **Highlight especular** superior-esquerdo (elipse branca 30% opacidade)
- **Drop shadow** dourado (`hsl(var(--gold)/0.45)`)
- Animação `gold-pulse` mantida no container

**1.2 Chuva física de grãos (componente `<SoybeanRain />`)**
- **Canvas HTML5** (`<canvas>` absoluto, `pointer-events-none`, `z-index: 0`, `mix-blend-mode: screen` para luminosidade premium)
- Loop `requestAnimationFrame` com física real:
  - **Gravidade**: `vy += 0.12` por frame
  - **Sway horizontal**: `vx = sin(t * frequency) * amplitude` (efeito vento suave)
  - **Rotação 3D**: cada grão tem `rotation` + `rotationSpeed` (varia -3° a +3°/frame)
  - **Spawn contínuo**: novo grão a cada 180-280ms em x aleatório (top do card)
  - **Pool de 35-45 grãos simultâneos** (limite p/ performance)
  - **Colisão com base do card**: bounce com damping (0.35) + decay rápido → grão desaparece em ~600ms
  - **Wind randomizer**: muda a cada 4-6s para parecer brisa natural
- **Render**: cada grão desenhado como elipse rotacionada com gradiente radial canvas + hilum + highlight (replica o SVG)
- **Resize observer**: ajusta canvas ao redimensionar o card (usa `devicePixelRatio` para nitidez)
- **Pause quando aba inativa** (`document.visibilitychange`) para não consumir CPU em background
- **`prefers-reduced-motion`**: spawn 0, exibe apenas 3 grãos estáticos decorativos

**1.3 Integração visual**
- Canvas posicionado dentro do card mas **atrás dos digit blocks** (usa `z-index: 0` decorativo, blocos `relative z-10`)
- Grãos caem **através** dos blocos numéricos (efeito mágico) — `mix-blend-mode: screen` faz dourado brilhar sobre o verde escuro sem obscurecer leitura
- Header e progresso mantêm `relative z-10`

---

### Parte 2 — `StatCard.tsx` (transformação 3D inteligente)

**2.1 Estrutura 3D real**
- Wrapper externo: `[perspective:1400px]`
- Card interno: `[transform-style:preserve-3d]` + tilt sutil em repouso (`rotateX(2deg) rotateY(-1deg)`)
- **Parallax no hover** (mouse move): `rotateX/rotateY` calculado do delta cursor → centro (max ±8°), `translateZ(20px)`
- **Camadas em profundidade**:
  - Layer 0 (back, `translateZ(-10px)`): glow colorido difuso (variant color)
  - Layer 1 (mid, `translateZ(0)`): superfície glass com `backdrop-blur-2xl` + ruído sutil
  - Layer 2 (`translateZ(15px)`): conteúdo (label, número, trend)
  - Layer 3 (`translateZ(30px)`): ícone flutuando + halo
- **Specular highlight dinâmico**: gradiente que segue cursor (radial-gradient com `--mx`/`--my` CSS vars)
- **Edge gold ring** (`ring-1 ring-inset ring-[hsl(var(--gold)/0.18)]`) + **inner shadow inset top** (luz)

**2.2 Ícones mais expressivos**
- Aumentar para `w-6 h-6` com `strokeWidth={2.25}` e drop-shadow colorido por variant
- Container do ícone: `w-12 h-12 rounded-2xl` com gradiente cônico sutil + ring + shadow 3D
- Ícone faz `translateZ(40px) scale(1.05)` no hover (salta da superfície)
- Adicionar **mini-pulse ring** no ícone quando há valor > 0 (indica atividade)

**2.3 Conexão inteligente (smart links)**
- Cada card mostra um **micro-status bar** abaixo do trend:
  - **Veículos**: barra de proporção `disponíveis/total` com cor verde→amarelo→vermelho conforme % livre
  - **Carrinhos**: ponto pulsante verde quando `em_uso > 0` com label "X em operação agora"
  - **Transportes**: chip com ícone de relógio + "próximo em Xmin" se houver pendente nas próximas 2h
  - **Tarefas**: chip vermelho pulsante se houver tarefa `urgente`
- Setinha `ArrowUpRight` no canto superior direito com micro-animação no hover (translate diagonal)
- Toda lógica derivada via props novos opcionais (`liveStatus?`, `progress?`, `urgentCount?`) — **zero breaking change** em outros usos do StatCard

**2.4 Touch/mobile**
- Sem hover em touch: tilt sutil em `:active` + `scale(0.97)` mantido
- `motion-reduce`: remove parallax, mantém apenas borda gold e ícone

---

### Parte 3 — `Dashboard.tsx` (passar dados ricos para os cards)

- Calcular e passar para cada `<StatCard>`:
  - **Veículos**: `progress={availableVehicles / vehicles.length}`
  - **Carrinhos**: `liveStatus={cartsInUse > 0 ? 'active' : 'idle'}`
  - **Transportes**: encontrar próximo transporte pendente nas próximas 2h → `nextLabel="próximo em 45min"`
  - **Tarefas**: contar `tasks.filter(t => t.prioridade === 'urgente' && t.status === 'pendente').length` → `urgentCount`

---

### Parte 4 — `index.css` (utilities novas)

Adicionar:
- `.card-3d-perspective` / `.card-3d-surface` (helpers)
- `@keyframes soybean-spin-3d` (rotação Y suave para grão decorativo header)
- `@keyframes pulse-ring-mini` (pulsação ring do ícone)
- Variáveis CSS dinâmicas `--mx`, `--my`, `--tilt-x`, `--tilt-y` aplicadas via `style` inline no hover

---

### Arquivos modificados
- `src/components/dashboard/FenasojaCountdown.tsx` — adicionar `SoybeanGrain` (SVG inline), `SoybeanRain` (canvas), substituir `Sprout`
- `src/components/StatCard.tsx` — refator 3D completo com parallax, layers, smart status
- `src/pages/Dashboard.tsx` — passar `progress`, `liveStatus`, `nextLabel`, `urgentCount` aos 4 StatCards
- `src/index.css` — keyframes e utilities auxiliares

### Não-objetivos (preservados)
- Schema do banco intocado
- Hooks intocados
- Sem novas dependências (canvas nativo, sem three.js para os grãos — performance superior)
- "Acessos Rápidos" e "Próximos Transportes" mantêm layout atual (foco da feature são countdown + 4 stat cards superiores)

### Critérios de aceite
1. Grão dourado de soja (SVG) substitui o ícone planta no header do countdown
2. Chuva contínua de grãos cai com física natural (gravidade + sway + rotação) atrás dos números, com bounce na base
3. Animação pausa em aba inativa e respeita `prefers-reduced-motion`
4. 4 StatCards têm profundidade 3D real com parallax no cursor (desktop) e indicador de status inteligente
5. Ícones maiores, com halo dourado e micro-pulsação quando há atividade
6. Performance: 60fps no desktop, ≤45 grãos simultâneos, GPU-accelerated
7. Mobile: tilt em `:active`, sem perda de performance
