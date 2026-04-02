

# Fix: Agenda Timezone Inconsistencies with Transports

## Problem

The Agenda page has three timezone bugs that cause transports to appear on wrong days and wrong time shifts compared to the Transports page:

1. **Date extraction** (line 181): `e.inicio_em?.split('T')[0]` extracts the UTC date portion from ISO timestamps. A transport at `23:00 BRT` = `02:00+1 UTC` appears on the next day in the Agenda.

2. **Day filtering** (line 210): `e.inicio_em?.startsWith(selectedDate)` matches against the UTC date portion, same problem.

3. **Shift detection** (line 28): `getShift()` uses `iso.slice(11, 13)` to get the hour — this is the UTC hour, not São Paulo hour. A transport at `14:00 BRT` (afternoon) could show as `17:00 UTC` (evening shift).

The Transports page uses `rawTime()` which correctly converts to São Paulo timezone, so times display correctly there but not in the Agenda grouping logic.

## Plan

### File: `src/pages/AgendaPage.tsx`

**1. Fix `getShift()` helper (line 27-31)**
Use `Date` + `toLocaleString` with `America/Sao_Paulo` timezone to extract the local hour:

```typescript
function getShift(iso: string): 'manha' | 'tarde' | 'noite' {
  const d = new Date(iso);
  const h = parseInt(d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }), 10);
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}
```

**2. Add a `getDateSP()` helper**
Extract the São Paulo date from an ISO timestamp:

```typescript
function getDateSP(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
```

**3. Fix date extraction for day chips (line 181)**
Replace `e.inicio_em?.split('T')[0]` with `getDateSP(e.inicio_em)`.

**4. Fix day filtering (line 210)**
Replace `e.inicio_em?.startsWith(selectedDate)` with `getDateSP(e.inicio_em) === selectedDate`.

## Files Changed

| File | Action |
|---|---|
| `src/pages/AgendaPage.tsx` | Fix 4 timezone bugs in date/shift logic |

