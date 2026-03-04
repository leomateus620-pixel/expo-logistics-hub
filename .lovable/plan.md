

# Plano: Corrigir dados não aparecendo nos menus

## Diagnóstico

O problema foi identificado: o usuário possui **3 organizações duplicadas** no banco, todas com o nome "Fenasoja 2026":

- `985888b8...` -- contém todos os dados (8 transportes, 5 veículos, 4 hóspedes, 50 membros)
- `3fbeb248...` -- org atual do usuário, **vazia** (apenas 1 membro)
- `4f66fe0c...` -- também vazia (1 membro)

O hook `useCurrentOrg` usa `.limit(1)` e retorna a primeira organização encontrada, que não necessariamente é a que tem os dados. Além disso, o `OrgGuard` cria automaticamente uma nova org "Fenasoja 2026" toda vez que não encontra uma, gerando duplicatas.

## Solução

### 1. Limpeza no banco de dados (migração SQL)
- Migrar todos os membros das orgs duplicadas para a org principal (`985888b8...`)
- Remover as orgs vazias duplicadas
- Atualizar referências de `org_id` nos membros

### 2. Corrigir `useCurrentOrg` para priorizar a org com dados
- Em vez de `.limit(1)`, buscar **todas** as memberships do usuário
- Priorizar a org salva no `localStorage`, ou a primeira retornada se não houver preferência

### 3. Corrigir `OrgGuard` para não criar orgs duplicadas
- Antes de criar uma nova org, verificar se o usuário já tem alguma org ativa
- Só criar se realmente não houver nenhuma

## Arquivos alterados
- **Migração SQL** -- mover dados e limpar duplicatas
- `src/hooks/useCurrentOrg.ts` -- buscar todas as memberships, priorizar por localStorage
- `src/components/OrgGuard.tsx` -- evitar criação duplicada

## Detalhes técnicos

A migração SQL irá:
1. Atualizar `org_members` das orgs duplicadas para apontar para `985888b8...` (evitando duplicatas de user_id)
2. Deletar as orgs vazias `3fbeb248...` e `4f66fe0c...`

O `useCurrentOrg` será alterado para:
```typescript
// Buscar todas as memberships
.select('id, org_id, role, ...')
.eq('user_id', user.id)
.eq('is_active', true)

// Priorizar a org do localStorage
const savedOrgId = localStorage.getItem(ORG_KEY);
const preferred = memberships.find(m => m.org_id === savedOrgId);
return preferred || memberships[0];
```

