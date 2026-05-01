# Apagar 2 despesas do sistema

## Registros identificados

| Título | Valor | Status | Data | Pagador | ID |
|---|---|---|---|---|---|
| Agua, luiz Carlos Molion | R$ 1.400,00 | Recusado | 01/05 | MICAEL ARCANJO BÖCK | `d5111e1d-f8de-41a5-be81-406db7120207` |
| Agua | R$ 1.400,00 | Recusado | 01/05 | MICAEL ARCANJO BÖCK | `61965f0e-962b-434f-82c3-2abf6e3ecf09` |

Ambos pertencem ao módulo de **Despesas** (categoria *Despesas Diversas*), com status `recusado`.

## Ação

Executar uma migração SQL que remove apenas estes dois IDs:

```sql
DELETE FROM public.expenses
WHERE id IN (
  'd5111e1d-f8de-41a5-be81-406db7120207',
  '61965f0e-962b-434f-82c3-2abf6e3ecf09'
);
```

## Efeitos colaterais

- `expense_documents` e `expense_approvals` vinculados a esses `expense_id` (se houver) serão removidos em cascata pelas FKs do schema, ou ficarão órfãos — vou verificar e incluir limpeza explícita na migração se necessário.
- Nenhum reembolso (`reimbursements`) está em estado pago para esses registros (status = recusado), então não há impacto financeiro.
- A operação é permanente — sem soft delete.

## Fora do escopo

- Não altera nenhum outro registro de despesas.
- Não altera políticas RLS, schema ou outros módulos.
