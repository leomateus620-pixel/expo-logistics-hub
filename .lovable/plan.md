

## Diagnóstico

Existem 2 formulários para "Serviços":
- **`6b8d52ef...`** (UPPERCASE) — criado pela minha migration de seed anterior
- **`6fcc088d...`** (lowercase) — enviado pelo próprio Valtair agora

Ambos geraram 6 autorizações cada → 12 registros duplicados em `mobility_authorizations`. Devo manter o que o **Valtair enviou** (6fcc088d, lowercase) e remover o seed (6b8d52ef).

A tabela `committee_mobility_members` deduplica via `notes/qr_access_free` mas não por nome, então o painel mostra 12 linhas.

## Correções

### 1. Migration SQL — remover duplicatas + permitir DELETE com capability

```sql
-- Apaga form duplicado do seed (cascateia members + RPC limpa authorizations)
DELETE FROM mobility_authorizations WHERE internal_form_id = '6b8d52ef-6ff6-4c4b-b11b-166ddfaf5d95';
DELETE FROM committee_mobility_members WHERE form_id = '6b8d52ef-6ff6-4c4b-b11b-166ddfaf5d95';
DELETE FROM committee_mobility_forms WHERE id = '6b8d52ef-6ff6-4c4b-b11b-166ddfaf5d95';

-- Permitir DELETE para usuários com mobility_access (hoje só admin/gestor)
DROP POLICY IF EXISTS "cmf_delete" ON committee_mobility_forms;
CREATE POLICY "cmf_delete" ON committee_mobility_forms FOR DELETE
  USING (
    get_user_org_role(auth.uid(), org_id) IN ('admin','gestor')
    OR has_capability(auth.uid(), org_id, 'mobility_access')
  );

DROP POLICY IF EXISTS "cmm_delete" ON committee_mobility_members;
CREATE POLICY "cmm_delete" ON committee_mobility_members FOR DELETE
  USING (
    get_user_org_role(auth.uid(), org_id) IN ('admin','gestor')
    OR has_capability(auth.uid(), org_id, 'mobility_access')
  );

-- Garantir que ao deletar form/member, as authorizations linkadas vão junto
-- (CASCADE já existe via internal_form_id/internal_member_id?) — verificar e adicionar trigger se não houver
```

Adicionar trigger ou usar `ON DELETE CASCADE` nas FKs `internal_form_id`/`internal_member_id` em `mobility_authorizations` para limpeza automática.

### 2. UI — botão de excluir integrante no `MobilityAdminPanel`

- Adicionar botão lixeira (`Trash2`) na coluna "Ações" de cada linha
- Confirmação via `AlertDialog` antes de excluir
- Chama `deleteMember.mutateAsync(m.id)` (já existe no hook `useMobilityMembers`)
- Após delete, também remover authorizations linkadas via `internal_member_id` (ou via CASCADE da FK)
- Toast de sucesso/erro

### 3. UI — botão excluir formulário inteiro

- Em `MobilityForm`/painel, listar formulários enviados com botão "Excluir solicitação" (cascade members + auths)
- Útil para o Valtair limpar erros futuros

## Arquivos
| Arquivo | Mudança |
|---|---|
| **Nova migration SQL** | DELETE seed duplicado + políticas DELETE com capability + CASCADE nas FKs |
| `src/components/mobility/MobilityAdminPanel.tsx` | Botão lixeira por integrante + AlertDialog |

## Resultado
- Painel mostra apenas os 6 integrantes corretos do Valtair (lowercase)
- Valtair (e admins) podem excluir integrantes/solicitações pelo painel quando errarem
- CASCADE garante consistência entre `committee_mobility_*` e `mobility_authorizations`

