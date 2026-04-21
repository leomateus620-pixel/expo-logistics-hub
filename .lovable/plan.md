

## Adicionar comissão "Comissão Central / Assessorias"

### Solução
Inserir nova comissão oficial via migração SQL na tabela `official_committees`. Como o módulo Mobilidade lê dinamicamente dessa tabela (`useOfficialCommittees` filtra por `org_id` + `is_active`), a nova comissão aparece imediatamente para todos os usuários da organização — tanto no formulário interno (`MobilityForm`) quanto nos links públicos.

### Migração SQL

```sql
INSERT INTO public.official_committees (org_id, committee_name, president_name, is_active)
VALUES (
  '985888b8-155f-4bbe-b6b9-6bef2893d99b',
  'Comissão Central / Assessorias',
  'MARCOS EDUARDO SERVAT',
  true
);
```

### Resultado
1. Novo item "Comissão Central / Assessorias" aparece no dropdown "Comissão *" em **Mobilidade → Nova Solicitação**.
2. Presidente pré-preenchido como **MARCOS EDUARDO SERVAT**.
3. Disponível para todos os usuários da organização e em qualquer link público gerado.

### Arquivos
| Tipo | Detalhe |
|---|---|
| Migração SQL | `INSERT` em `public.official_committees` |

Nenhuma alteração de código necessária.

