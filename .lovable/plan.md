

# Plano: Ajustar horários para fuso de São Paulo (UTC-3)

## Problema
Todos os `new Date().toISOString()` geram horário UTC. Formulários e timestamps automáticos ficam 3 horas adiantados em relação a São Paulo.

## Solução

### 1. Criar função utilitária `nowSP()` em `src/lib/utils.ts`
Função que retorna a data/hora atual no fuso `America/Sao_Paulo`:
- `nowSP()` → ISO string completa no fuso SP
- `nowSPLocal()` → formato `YYYY-MM-DDTHH:MM` para inputs `datetime-local`
- `todaySP()` → formato `YYYY-MM-DD` para inputs `date`

### 2. Substituir todas as ocorrências de `new Date().toISOString()` e `new Date()`

**Arquivos afetados (8 arquivos):**
- `src/pages/TransportsPage.tsx` — 4 ocorrências (abertura formulário, devolução, fourHoursAgo)
- `src/pages/ElectricCartsPage.tsx` — 4 ocorrências (retirada, devolução)
- `src/pages/ChecklistPage.tsx` — 2 ocorrências (today, tomorrow)
- `src/pages/Dashboard.tsx` — 2 ocorrências (now, todayStr)
- `src/pages/AgendaPage.tsx` — 2 ocorrências (today, tomorrow)
- `src/pages/VehiclesPage.tsx` — 1 ocorrência (devolução)
- `src/hooks/useElectricCarts.ts` — 2 ocorrências (pickup, return)
- `src/hooks/useTasks.ts` — 1 ocorrência (completed_at)

### 3. Atualizar funções de exibição em `rawTime`, `rawWeekday` etc.
Adicionar conversão para fuso SP ao exibir datas que vêm do banco em UTC.

