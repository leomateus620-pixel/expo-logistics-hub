

# Módulo de Autorização de Mobilidade por Comissão

## Resumo

Criar um módulo completo para que cada comissão da Fenasoja registre quais integrantes estão autorizados a usar carro elétrico e/ou patinete. Inclui seed de 29 comissões oficiais, formulário de solicitação, cadastro de integrantes, e painel administrativo com filtros, contadores e exportação.

## Estrutura de Dados (3 tabelas novas + seed)

### Tabela `official_committees`
Armazena a base oficial de comissões/presidentes. Serve como referência imutável para histórico.

```sql
CREATE TABLE official_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  committee_name text NOT NULL,
  president_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, committee_name)
);
```

RLS: select para membros da org, insert/update/delete para admin/gestor.

### Tabela `committee_mobility_forms`
Registro de cada solicitação de mobilidade por comissão.

```sql
CREATE TABLE committee_mobility_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  committee_id uuid NOT NULL REFERENCES official_committees(id),
  committee_name_snapshot text NOT NULL,
  president_name_snapshot text NOT NULL,
  operational_responsible_name text,
  operational_responsible_phone text,
  operational_responsible_email text,
  needs_electric_car boolean NOT NULL DEFAULT false,
  needs_scooter boolean NOT NULL DEFAULT false,
  submission_status text NOT NULL DEFAULT 'rascunho',
  submitted_at timestamptz,
  submitted_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: select para membros, insert/update para admin/gestor/operador, delete para admin/gestor.

### Tabela `committee_mobility_members`
Integrantes autorizados por formulário.

```sql
CREATE TABLE committee_mobility_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  form_id uuid NOT NULL REFERENCES committee_mobility_forms(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES official_committees(id),
  member_name text NOT NULL,
  member_role text,
  member_identifier text,
  access_electric_car boolean NOT NULL DEFAULT false,
  access_scooter boolean NOT NULL DEFAULT false,
  qr_access_free boolean NOT NULL DEFAULT false,
  access_status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: mesma lógica das demais tabelas do sistema.

### Seed das 29 comissões oficiais
Inserir via migration as 29 comissões com seus presidentes para todas as orgs existentes. Usar `ON CONFLICT DO NOTHING` para segurança.

## Arquivos a criar

| Arquivo | Descrição |
|---|---|
| `supabase/migrations/...sql` | Criação das 3 tabelas, RLS, seed |
| `src/hooks/useOfficialCommittees.ts` | CRUD para comissões oficiais |
| `src/hooks/useMobilityForms.ts` | CRUD para formulários de mobilidade |
| `src/hooks/useMobilityMembers.ts` | CRUD para integrantes autorizados |
| `src/pages/MobilityAuthPage.tsx` | Página principal com painel admin + formulário |
| `src/components/mobility/MobilityForm.tsx` | Formulário de solicitação por comissão |
| `src/components/mobility/MobilityMemberRow.tsx` | Linha de integrante no formulário |
| `src/components/mobility/MobilityAdminPanel.tsx` | Painel com stats, filtros, tabela, exportação |

## Arquivos a modificar

| Arquivo | Alteração |
|---|---|
| `src/App.tsx` | Adicionar rota `/mobility-auth` |
| `src/components/Sidebar.tsx` | Adicionar link "Mobilidade" no grupo Operação |
| `src/components/BottomTabs.tsx` | Adicionar link no menu "Mais" |

## Funcionalidades do formulário

- Select de comissão populado com as 29 oficiais
- Auto-preenche presidente oficial (somente leitura para não-admin)
- Campos de responsável operacional (nome, telefone, email)
- Toggle "Precisa de carro elétrico?" / "Precisa de patinete?"
- Área dinâmica para adicionar integrantes quando sim
- Cada integrante: nome, cargo, identificador, checkbox carro/patinete/ambos, QR gratuito, observação
- Botão de enviar que salva snapshot do presidente no formulário

## Funcionalidades do painel administrativo

- Cards de resumo: comissões respondidas, total integrantes, carro elétrico, patinete, QR gratuito
- Busca por nome de integrante
- Filtros: comissão, modal (carro/patinete), status de liberação
- Tabela com todos os integrantes autorizados
- Ações: liberar, revisar, bloquear acesso
- Exportação CSV filtrada (todos, só carro, só patinete)
- Expandir formulário de cada comissão para ver detalhes

## Fluxo de dados

```text
Comissão oficial (seed)
  └─> Formulário de mobilidade (1 por comissão)
        └─> Integrantes autorizados (N por formulário)
              └─> Status: pendente → liberado / bloqueado
```

## Segurança

- RLS em todas as tabelas usando `is_org_member` e `get_user_org_role`
- Snapshots de presidente/comissão no formulário para preservar histórico
- Unicidade de integrante por comissão+modal via validação no frontend
- Audit trail via tabela `audit_log` existente

## UX/UI

- Design consistente com o restante do sistema (cards, badges, tons gold)
- Responsivo mobile/desktop
- Estados de loading, empty state, sucesso e erro
- Formulário limpo e guiado passo a passo
- Painel operacional com leitura rápida

