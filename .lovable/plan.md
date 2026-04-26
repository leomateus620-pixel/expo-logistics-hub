## Objetivo

Transformar o card **Agenda** do Dashboard, hoje limitado a "Hoje + Amanhã", em uma visão de **7 dias corridos** (hoje + 6 dias seguintes), mantendo as duas colunas existentes (Transportes & Agenda · Eventos Fenasoja) e o design Liquid Glass / gold já aprovado.

## Diagnóstico

Em `src/pages/Dashboard.tsx`:

- `todayEvents` / `tomorrowEvents` filtram `agendaItems` apenas por `todayStr` e `tomorrowStr`.
- `fenasojaToday` / `fenasojaTomorrow` fazem o mesmo para `fenasojaEvents`.
- O badge do header mostra `{totalToday} hoje · {totalTomorrow} amanhã` e a renderização tem dois blocos fixos ("Hoje" e "Amanhã") em cada coluna.

Para semana, precisamos generalizar para um array de 7 dias (hoje → +6) e agrupar dinamicamente.

## Plano

### 1. Gerar a janela de 7 dias (uma única fonte de verdade)

Criar, junto aos memos existentes, um helper:

```ts
const weekDays = useMemo(() => {
  const base = new Date(`${todayStr}T12:00:00-03:00`); // meio-dia SP evita DST
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    return {
      key,
      label:
        i === 0 ? 'Hoje'
        : i === 1 ? 'Amanhã'
        : d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' })
            .replace('.', '')
            .replace(/^./, c => c.toUpperCase()),
      ddmm: key.split('-').slice(1).reverse().join('/'), // DD/MM
    };
  });
}, [todayStr]);
```

### 2. Agrupar dados por dia

Substituir os 4 memos atuais (`todayEvents`, `tomorrowEvents`, `fenasojaToday`, `fenasojaTomorrow`) por dois mapas indexados por `YYYY-MM-DD`:

```ts
const transportsByDay = useMemo(() => {
  const keys = new Set(weekDays.map(d => d.key));
  const map: Record<string, any[]> = {};
  for (const it of agendaItems) {
    const k = toSPDate(it.inicio_em);
    if (!keys.has(k)) continue;
    (map[k] ||= []).push(it);
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  }
  return map;
}, [agendaItems, weekDays]);

const fenasojaByDay = useMemo(() => { /* idem para fenasojaEvents */ }, [fenasojaEvents, weekDays]);
```

### 3. Atualizar o header (badge + range)

```tsx
const totalWeekTransports = weekDays.reduce((s, d) => s + (transportsByDay[d.key]?.length || 0), 0);
const totalWeekFenasoja  = weekDays.reduce((s, d) => s + (fenasojaByDay[d.key]?.length || 0), 0);
const rangeLabel = `${weekDays[0].ddmm} – ${weekDays[6].ddmm}`;
```

Header passa a exibir:
- Título: `Agenda · Próximos 7 dias`
- Subtítulo discreto (text-[10px] muted): `{rangeLabel}`
- Badge: `{totalWeekTransports + totalWeekFenasoja} eventos · 7 dias`

### 4. Renderização agrupada nas duas colunas

Substituir os blocos `Hoje` / `Amanhã` por um `weekDays.map(day => ...)` que só renderiza dias com itens. Cabeçalho de cada grupo segue o padrão atual (chip uppercase, cor primária na coluna esquerda, gold na direita, com destaque especial para "Hoje"):

```tsx
{weekDays.map(day => {
  const items = transportsByDay[day.key] || [];
  if (!items.length) return null;
  const isToday = day.key === todayStr;
  return (
    <div key={day.key}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5
                     ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
        {day.label} <span className="opacity-60">— {day.ddmm}</span>
        {isToday && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      </p>
      <div className="space-y-1.5">{items.map(renderTransportItem)}</div>
    </div>
  );
})}
```

Mesma estrutura na coluna Fenasoja, com `text-gold` e `renderFenasojaItem`.

### 5. Estado vazio + scroll

- Empty state da coluna passa a dizer: `"Sem registros nos próximos 7 dias."`
- Empty state global (`isEmpty`) idem.
- Cada coluna ganha `max-h-[420px] overflow-y-auto pr-1` (com `scrollbar-thin` se já houver utilitário) para evitar que 7 dias inflacionem o card no desktop, mantendo alinhamento com os outros blocos do Dashboard.

### 6. Performance

Tudo permanece em `useMemo`, `agendaItems`/`fenasojaEvents` já vêm cacheados via React Query (`staleTime: 30s`). Não há novas queries — apenas reorganização client-side. Sem impacto em FPS nem em payload.

## Arquivos a alterar

- `src/pages/Dashboard.tsx` — substituir memos e bloco JSX do card Agenda (linhas ~189–201 e ~467–624). Nenhum outro arquivo é afetado.

## Fora de escopo

- Página `/agenda` (continua com seu próprio range).
- Filtros interativos (seletor de período) — pode ser proposto em iteração futura se desejado.
