

# Correção do Fuso Horário nos Hóspedes (Check-in / Check-out)

## Problema

O `DateTimePicker` emite valores sem offset (ex: `2026-05-10T12:00`). O `GuestsPage` envia esse valor diretamente ao banco. O Supabase interpreta como UTC, então `12:00 BRT` vira `12:00 UTC` = `09:00 BRT` — 3 horas a menos.

O `TransportsPage` já resolve isso com `ensureSPOffset()`, mas o `GuestsPage` nunca foi atualizado.

## Dados existentes afetados

Todos os 12 hóspedes com datas estão com horários 3h atrasados no banco. Ex: CRISTIAN checkin salvo como `08:00 UTC` quando deveria ser `08:00-03:00` (= `11:00 UTC`).

## Correções

### 1. Migração SQL — corrigir dados existentes
Adicionar 3 horas a todos os `checkin_em` e `checkout_em` existentes:
```sql
UPDATE guests SET checkin_em = checkin_em + interval '3 hours' WHERE checkin_em IS NOT NULL;
UPDATE guests SET checkout_em = checkout_em + interval '3 hours' WHERE checkout_em IS NOT NULL;
```

### 2. `src/pages/GuestsPage.tsx` — aplicar `ensureSPOffset` ao salvar

No `handleAdd` e `handleEdit`, envolver `checkin_em` e `checkout_em` com `ensureSPOffset()` antes de enviar ao banco:
```typescript
checkin_em: form.checkin_em ? ensureSPOffset(form.checkin_em) : null,
checkout_em: form.checkout_em ? ensureSPOffset(form.checkout_em) : null,
```

### 3. `src/pages/GuestsPage.tsx` — corrigir `openEdit` para converter UTC→SP local

Ao abrir edição, o valor vem do banco em UTC. Precisa converter para horário SP antes de popular o formulário, para que o DateTimePicker mostre o horário correto:
```typescript
// Converter ISO UTC para datetime-local em SP
function utcToSPLocal(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('sv-SE', { 
    timeZone: 'America/Sao_Paulo', 
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false 
  }).formatToParts(d);
  // reconstruct YYYY-MM-DDTHH:MM
}
```

### Arquivos alterados

| Arquivo | Ação |
|---|---|
| `src/pages/GuestsPage.tsx` | Editar — adicionar `ensureSPOffset` no save + converter UTC→local no edit |
| SQL migration | Criar — corrigir dados existentes (+3h) |

