

# Plano de Melhorias: Transportes, Veiculos, Equipe

## 1. Campos KM Retirada e KM Devolucao no Novo Transporte

A tabela `transports` nao possui campos de KM. Sera necessario adicionar `km_retirada` e `km_devolucao` na tabela `transports` via migracao SQL.

### Banco de dados
```sql
ALTER TABLE public.transports
  ADD COLUMN km_retirada numeric,
  ADD COLUMN km_devolucao numeric;
```

### TransportsPage.tsx
- Adicionar campos `km_retirada` e `km_devolucao` no formulario de criacao (Novo Transporte).
- No formulario de edicao, mostrar `km_devolucao` (preenchido ao concluir).
- Ao salvar, gravar os valores na tabela `transports`.

### Integracao com Veiculos
- Quando um transporte for concluido e tiver `km_retirada` e `km_devolucao` preenchidos:
  - Criar automaticamente um registro em `vehicle_usage` com os KM correspondentes.
  - Atualizar o `km_atual` do veiculo com o valor de `km_devolucao`.
- O `useVehicleUsage` ja soma todos os `km_rodados` da tabela `vehicle_usage`, entao o total e o custo estimado serao atualizados automaticamente.

---

## 2. Corrigir calculo do Custo Estimado de Combustivel

Na `VehiclesPage.tsx` linha 83, o calculo `totalKm * 0.65` esta correto no codigo. Porem o `totalKm` vindo do hook pode estar retornando valores incorretos se `km_rodados` for um campo GENERATED AS `(km_chegada - km_saida)` que esta retornando NULL para registros sem `km_chegada`.

Verificarei se a coluna `km_rodados` e realmente `GENERATED ALWAYS AS (km_chegada - km_saida) STORED`. No schema atual ela aparece como coluna normal (nao generated). O hook `useVehicleUsage` filtra `NOT NULL` corretamente. O problema pode ser que na tabela o campo nao esta sendo calculado automaticamente. A correcao sera garantir que ao gravar `km_chegada`, tambem se grave `km_rodados = km_chegada - km_saida` via hook.

**Alteracao:** No `useVehicleUsage.ts`, ao fazer `updateUsage`, calcular e salvar `km_rodados` junto com `km_chegada`.

---

## 3. Ocultar transportes concluidos apos 4 horas

### TransportsPage.tsx
- Filtrar a lista `sorted` para excluir transportes com `status === 'concluido'` cuja `updated_at` (ou timestamp de conclusao) seja anterior a 4 horas atras.
- Essa filtragem se aplica apenas a visualizacao padrao (sem pesquisa ativa).

---

## 4. Campo de pesquisa de transportes (por motorista e data)

### TransportsPage.tsx
- Adicionar barra de pesquisa no topo com:
  - Select de motorista (filtrar por `motorista_user_id`).
  - Input de data (filtrar por data de `inicio_em`).
- Quando houver filtro ativo, mostrar TODOS os transportes (incluindo concluidos ocultos).
- Botao "Limpar filtros" para voltar a visualizacao padrao.

---

## 5. Campo COMISSAO na Equipe

### Banco de dados
- Criar tabela `commissions` (id, org_id, nome, created_at) para cadastrar comissoes.
- Adicionar coluna `commission_id` (uuid, nullable) na tabela `org_members`.

```sql
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
-- RLS: mesmas regras de org_members

ALTER TABLE public.org_members ADD COLUMN commission_id uuid;
```

### TeamPage.tsx
- Adicionar secao para cadastrar comissoes (botao "Nova Comissao" + dialog com campo nome).
- No formulario de adicionar/editar membro, incluir Select de comissao.
- Na listagem de membros, agrupar ou exibir badge com o nome da comissao.
- Criar hook `useCommissions` para CRUD de comissoes.

---

## Detalhes Tecnicos

### Migracao SQL completa
```sql
-- Campos KM no transporte
ALTER TABLE public.transports
  ADD COLUMN km_retirada numeric,
  ADD COLUMN km_devolucao numeric;

-- Tabela de comissoes
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_select" ON public.commissions
  FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "commissions_insert" ON public.commissions
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
CREATE POLICY "commissions_update" ON public.commissions
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
CREATE POLICY "commissions_delete" ON public.commissions
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );

-- Campo comissao no membro
ALTER TABLE public.org_members ADD COLUMN commission_id uuid;
```

### Arquivos a criar/modificar

1. **Novo: `src/hooks/useCommissions.ts`** - CRUD de comissoes
2. **`src/pages/TransportsPage.tsx`** - Campos KM, filtro de pesquisa, ocultar concluidos 4h
3. **`src/hooks/useTransports.ts`** - Incluir km_retirada/km_devolucao no create/update
4. **`src/hooks/useVehicleUsage.ts`** - Garantir calculo de km_rodados no updateUsage
5. **`src/pages/VehiclesPage.tsx`** - Nenhuma alteracao necessaria (calculo ja correto)
6. **`src/pages/TeamPage.tsx`** - Cadastro de comissoes + select no formulario de membro

