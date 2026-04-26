## 1) Bug de altura do card "Tarefas" (StatCard)

**Causa raiz identificada** em `src/components/StatCard.tsx`:

```tsx
{(showProgressBar || smartLabel || (urgentCount && urgentCount > 0)) && (
  <div className="mt-2.5 ...">…</div>
)}
```

Quando `urgentCount = 0`, a expressão `(urgentCount && urgentCount > 0)` avalia para `0` (falsy mas **renderizável**), e o operador `||` retorna `0`. JSX então renderiza `{0 && <div>}` → imprime literalmente o caractere **"0"** abaixo do `trend "pendentes"` — exatamente o "0" extra visível na imagem do card Tarefas. Isso também desalinha visualmente os 4 cards (Veículos tem barra de progresso → smart-row; Tarefas mostra "0" → altura inconsistente).

**Correções:**

- **a)** Reescrever a guarda usando booleanos estritos:
  ```tsx
  const hasSmartRow = showProgressBar || !!smartLabel || (typeof urgentCount === 'number' && urgentCount > 0);
  {hasSmartRow && (<div ...>...)}
  ```
- **b)** Garantir altura uniforme dos 4 StatCards usando `min-h` no container de conteúdo (ex.: `min-h-[112px]` no `div.relative.p-4`) para que cards com/sem barra/chip fiquem visualmente alinhados na grade 2x2.
- **c)** Aplicar a mesma proteção de booleanos no chip `urgentCount` (`!!urgentCount && urgentCount > 0` → `typeof urgentCount === 'number' && urgentCount > 0`).

---

## 2) Card "Agenda" do Dashboard — dual-source (Transportes da Agenda + Eventos Fenasoja)

Atualmente o card "Agenda" usa `events` (tabela `events`) + transportes ativos, mas **não inclui eventos da tabela `fenasoja_events`** (menu "Eventos Fenasoja"). O usuário quer um card dividido em duas colunas/seções inteligentes.

### Estrutura proposta (em `src/pages/Dashboard.tsx`)

Substituir a `<Section title="Agenda">` por um novo **card dual-pane** com duas sub-seções lado a lado (responsivo: 2 colunas no desktop ≥sm, empilhado no mobile):

```
┌─────────────────────────────────────────────────────────────┐
│ 📅 Agenda                                       Ver tudo →  │
├──────────────────────────┬──────────────────────────────────┤
│  🚗 TRANSPORTES & AGENDA │  🌾 EVENTOS FENASOJA             │
│  (events + transports)   │  (fenasoja_events)               │
│                          │                                   │
│  • Hoje (3)              │  • Hoje (2)                      │
│    08:30 ✈ Voo POA       │    09:00 ☀️ Abertura Oficial     │
│    14:00 🚗 Hotel→Centro │    20:00 🌙 Show Sertanejo       │
│  • Amanhã (1)            │  • Amanhã (1)                    │
│    07:00 ✈ Chapecó       │    14:00 🌅 Palestra Soja        │
└──────────────────────────┴──────────────────────────────────┘
```

### Implementação

1. **Hook**: importar `useFenasojaEvents` em `Dashboard.tsx`.
2. **Filtragem dual**:
   - `agendaItems` (já existe) → coluna esquerda → "Transportes & Agenda".
   - `fenasojaItems` (novo) → filtrar `fenasojaEvents` por `toSPDate === todayStr` e `=== tomorrowStr`.
3. **Novo componente local `<DualAgendaCard>`** dentro de `Dashboard.tsx`, baseado em `<Section>` mas com layout `grid sm:grid-cols-2 gap-4` e divisor vertical sutil (`sm:divide-x divide-border/40`).
4. **Coluna esquerda — "Transportes & Agenda"** (design já existente, refinado):
   - Header: ícone `MapPin` + texto verde primário.
   - Reusar a renderização atual de `todayEvents` / `tomorrowEvents` (linhas com hora, voo, responsável).
   - `onClick` → navega para `/agenda` ou `/transports` conforme `_source`.
5. **Coluna direita — "Eventos Fenasoja"** (inspirado em `EventCard.tsx`):
   - Header: ícone soybean grain (reusar `<SoybeanGrain />` em mini) + texto gold.
   - Cada item compacto: chip de turno (Manhã/Tarde/Noite com `Sun`/`Sunset`/`Moon` + `bg-gold/15`), hora em `font-mono` destacada em gold, título uppercase, local com `MapPin`.
   - Borda lateral esquerda 3px gold (igual ao EventCard, mas miniaturizada).
   - `onClick` → navega para `/fenasoja-events`.
6. **Estado vazio inteligente**: cada coluna tem seu próprio empty state (não bloqueia a outra). Ex.: se só houver fenasoja sem transportes, mostra "Sem transportes hoje" do lado esquerdo e a lista de eventos do lado direito.
7. **Badge no header**: contagem combinada `${transportesHoje + fenasojaHoje} hoje · ${transportesAmanha + fenasojaAmanha} amanhã`.
8. **"Ver tudo"**: dropdown sutil com 2 opções (Agenda / Eventos Fenasoja) — ou simplificar como dois links no header, um por coluna.

### Helper de turno (reutilizar lógica do EventCard)

Extrair `getShift(iso)` e `shiftMeta` para arquivo utilitário `src/lib/shiftHelpers.ts` (export shared) ou inline no Dashboard como função local pequena — a abordagem inline é suficiente já que é leve.

---

## Arquivos a modificar

- **`src/components/StatCard.tsx`** — corrigir bug do "0" renderizado + adicionar `min-h` para alinhamento dos 4 cards.
- **`src/pages/Dashboard.tsx`** — importar `useFenasojaEvents`, substituir `<Section title="Agenda">` pelo novo `<DualAgendaCard>` com duas colunas (Transportes & Agenda | Eventos Fenasoja), aproveitando design dos menus correspondentes.

Nenhuma mudança de banco de dados necessária. Sem novas dependências.