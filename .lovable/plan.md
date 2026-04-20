

## Correção de typo na descrição da despesa

### Problema
A despesa (ID `82334331-f1e8-402b-bbcf-15621879d858`) contém "ouve" em vez de "houve" na descrição.

### Solução
Executar uma migração SQL para corrigir o texto:

```sql
UPDATE expenses
SET description = REPLACE(description, 'ouve', 'houve'),
    updated_at = now()
WHERE id = '82334331-f1e8-402b-bbcf-15621879d858';
```

### Arquivo
| Tipo | Detalhe |
|---|---|
| Migração SQL | `UPDATE` na coluna `description` da tabela `expenses` |

Nenhuma alteração de código necessária.

