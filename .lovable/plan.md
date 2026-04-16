

# Refatoração do Módulo Mobilidade — Plano de Implementação

## Resumo

Remover toda a funcionalidade de links públicos, manter o fluxo interno (Nova Solicitação → Painel → Carrinhos/Patinetes), e criar um sistema de permissões granulares para suportar o login restrito `fenasojalog2026@hotmail.com`.

---

## Análise do estado atual

### Tabelas no banco
- **Internas (manter):** `committee_mobility_forms`, `committee_mobility_members` — usadas pelo fluxo interno
- **Públicas (remover lógica, preservar dados):** `public_form_links` (29 registros), `public_mobility_forms`, `public_mobility_members`, `public_form_audit` — todas com 0 registros úteis exceto links
- **Autorizações:** `mobility_authorizations` — consumida pelos menus Carrinhos Elétricos e Patinetes via `AuthorizationsTab`

### Problema de fluxo identificado
O fluxo interno (MobilityForm → committee_mobility_forms/members) **não sincroniza automaticamente** com `mobility_authorizations`. A função `sync_public_mobility_form` só é chamada pelo fluxo público. Isso significa que solicitações internas **não aparecem** na aba Autorizações dos menus Carrinhos Elétricos e Patinetes. Este é um bug real que precisa ser corrigido.

### Roles existentes
Enum `org_role`: `admin`, `gestor`, `operador`, `leitura`. Não existe conceito de "capability" granular por módulo.

---

## Etapas de implementação

### 1. Criar sistema de capabilities por módulo
**Migração SQL:**
- Criar tabela `user_capabilities` com colunas: `id`, `user_id`, `org_id`, `capability` (text), `created_at`
- Capabilities iniciais: `mobility_access`, `full_access` (wildcard)
- RLS: membros ativos podem ler suas próprias capabilities
- Criar função `has_capability(uuid, uuid, text)` SECURITY DEFINER

**Lógica:** Admin/Gestor/Operador herdam `full_access` automaticamente. O login restrito receberá apenas `mobility_access`.

### 2. Criar o usuário restrito
- Usar edge function `create-user` ou migration para criar o usuário `fenasojalog2026@hotmail.com` com senha `2026fenasoja`
- Vinculá-lo à organização existente como role `leitura` (mínimo de privilégio)
- Inserir capability `mobility_access` para esse user_id + org_id
- Habilitar auto-confirm para este signup específico

### 3. Criar hook `useCapabilities`
- Busca capabilities do usuário logado
- Expõe `hasCapability(name)` e `hasFullAccess`
- Admin/Gestor/Operador → `full_access` automático (via query ou lógica no hook baseada no role do `useCurrentOrg`)

### 4. Proteger rotas e sidebar
**Sidebar (`Sidebar.tsx`):**
- Filtrar `groups` com base nas capabilities do usuário
- Mobilidade visível se `mobility_access` ou `full_access`
- Demais menus visíveis apenas com `full_access`
- Botão "Sair" sempre visível

**Rotas (`App.tsx`):**
- Criar componente `CapabilityGuard` que redireciona para `/mobility-auth` se o usuário não tem `full_access` e tenta acessar outra rota
- Rota `/mobility-auth` acessível com `mobility_access`

### 5. Corrigir sincronização interna → autorizações
**Problema crítico:** Ao criar solicitação interna, os membros ficam em `committee_mobility_members` mas **nunca** chegam em `mobility_authorizations`.

**Solução:** Criar função SQL `sync_internal_mobility_form(form_id)` que:
- Lê membros de `committee_mobility_members` para o form
- Insere em `mobility_authorizations` com `source_origin = 'interno'`
- Chamada automaticamente via trigger AFTER INSERT em `committee_mobility_members` ou explicitamente no hook após salvar todos os membros

### 6. Remover funcionalidade de links públicos

**Frontend — remover:**
- `src/components/mobility/MobilityLinksPanel.tsx`
- `src/hooks/usePublicFormLinks.ts`
- `src/pages/PublicMobilityFormPage.tsx`
- `src/lib/publicMobility.ts`
- Aba "Links" de `MobilityAuthPage.tsx`
- Rota `/f/mobilidade/:token` e componente `PublicMobilityRoute` de `App.tsx`
- Import de `Link2` e `MobilityLinksPanel` em `MobilityAuthPage`

**Backend — remover edge functions:**
- `supabase/functions/resolve-public-link/`
- `supabase/functions/submit-public-form/`

**Banco — NÃO dropar tabelas** (preservar dados históricos). Apenas remover as funções SQL públicas se desejado numa fase futura.

### 7. Simplificar MobilityAuthPage
- Remover aba "Links", manter apenas "Painel" e "Nova Solicitação"
- Tabs: `Painel` | `Nova Solicitação`

### 8. Auditoria do fluxo completo
Validar após implementação:
1. Criar solicitação → persiste em `committee_mobility_forms` + `committee_mobility_members`
2. Sincroniza automaticamente → `mobility_authorizations`
3. Painel (`MobilityAdminPanel`) mostra KPIs e listagem corretos
4. `ElectricCartsPage` → aba Autorizações mostra membros com `authorization_type = 'carro_eletrico'`
5. `ScootersPage` → aba Autorizações mostra membros com `authorization_type = 'patinete'`
6. Status (pendente/liberado/bloqueado) funciona end-to-end
7. Refresh não perde dados
8. Filtros e contadores consistentes

---

## Arquivos modificados

| Arquivo | Ação |
|---------|------|
| `src/pages/MobilityAuthPage.tsx` | Remover aba Links |
| `src/components/mobility/MobilityLinksPanel.tsx` | Deletar |
| `src/hooks/usePublicFormLinks.ts` | Deletar |
| `src/pages/PublicMobilityFormPage.tsx` | Deletar |
| `src/lib/publicMobility.ts` | Deletar |
| `src/App.tsx` | Remover rota pública, imports, PublicMobilityRoute |
| `src/components/Sidebar.tsx` | Filtrar menus por capability |
| `src/hooks/useCapabilities.ts` | Criar |
| `src/components/CapabilityGuard.tsx` | Criar |
| `supabase/functions/resolve-public-link/` | Deletar |
| `supabase/functions/submit-public-form/` | Deletar |
| **Migrações SQL** | Tabela capabilities, função sync interna, trigger, criação do usuário |

---

## Detalhe técnico: segurança

- O bloqueio não é apenas visual — rotas protegidas por `CapabilityGuard` redirecionam
- RLS nas tabelas de mobilidade já filtra por `org_id` + membership
- O usuário restrito terá role `leitura` (sem poder editar outros módulos) + capability `mobility_access`
- Capabilities são verificadas tanto no frontend (sidebar + rotas) quanto no banco (RLS pode ser estendida)

