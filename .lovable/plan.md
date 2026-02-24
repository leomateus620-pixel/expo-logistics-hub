
# Plano de Melhorias: Veiculos, Transportes e Acesso por Membro

## 1. Registro de KM rodados por uso de veiculo

Criar uma tabela `vehicle_usage` para registrar cada retirada/devolucao de veiculo com controle de KM.

### Banco de dados (migracao SQL)
- Nova tabela `vehicle_usage` com colunas:
  - `id`, `org_id`, `vehicle_id`, `responsavel_user_id`
  - `km_saida` (numeric, preenchido na retirada)
  - `km_chegada` (numeric, NULL ate a devolucao -- obrigatorio na devolucao)
  - `km_rodados` (numeric, calculado: km_chegada - km_saida)
  - `retirada_em` (timestamp), `devolucao_em` (timestamp, NULL ate devolver)
  - `observacoes` (text, opcional)
  - `created_at`, `updated_at`
- RLS: mesmas regras da tabela `vehicles` (select para membros, insert/update para admin/gestor/operador)

### Hook `useVehicleUsage`
- Novo hook para CRUD da tabela `vehicle_usage`
- Queries filtradas por `org_id` e opcionalmente por `vehicle_id`

### Pagina VehiclesPage
- Ao clicar em um veiculo, abrir um painel/dialog com:
  - Botao "Registrar Retirada" (preenche km_saida, responsavel, data/hora)
  - Na listagem de usos, cada registro mostra: responsavel, km_saida, km_chegada, km_rodados
  - Botao "Registrar Devolucao" no uso aberto (campo km_chegada obrigatorio)
  - O campo `km_atual` do veiculo sera atualizado automaticamente com o ultimo `km_chegada`
- Exibir historico de usos de cada veiculo com KM rodados por uso

---

## 2. Custo total estimado com combustivel

### Pagina VehiclesPage
- Card de resumo no topo da pagina mostrando:
  - Total de KM rodados (soma de `km_rodados` de todos os registros de `vehicle_usage`)
  - Custo estimado = Total KM x R$ 0,65
  - Formato monetario brasileiro (R$ X.XXX,XX)

---

## 3. Campo COR visivel no card do veiculo

### Pagina VehiclesPage
- O campo `cor` ja existe na tabela `vehicles` e no formulario de cadastro
- Adicionar `cor` ao formulario de edicao (atualmente nao esta la)
- Exibir a cor no card do veiculo (abaixo da placa ou como badge colorida)

---

## 4. Remover "Observacoes" do Editar Transporte

### Pagina TransportsPage
- Remover o campo `Textarea` de observacoes do `renderFormFields` quando usado no dialog de edicao
- Manter no dialog de criacao (ou remover de ambos -- o campo sera removido de ambos para simplicidade, ja que esta no edit)
- Na verdade, remover APENAS do dialog de edicao. Separar o `renderFormFields` para aceitar um parametro `showObservacoes`

---

## 5. Acesso pessoal a escala/agenda para iniciar e concluir transportes

### Pagina VerEscalaPage
- Quando o usuario logado visualizar a Escala, filtrar automaticamente por seu proprio `user_id` como padrao
- Para itens do tipo "transporte", exibir botoes "Iniciar" e "Concluir" (mesma logica do `cycleStatus` da TransportsPage)
- O operador podera alterar o status do transporte diretamente da Escala
- Usar `useAuth` para obter o `user_id` do usuario logado e pre-selecionar no filtro de membro

---

## Detalhes Tecnicos

### Migracao SQL
```sql
CREATE TABLE public.vehicle_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  responsavel_user_id uuid,
  km_saida numeric NOT NULL,
  km_chegada numeric,
  km_rodados numeric GENERATED ALWAYS AS (
    CASE WHEN km_chegada IS NOT NULL THEN km_chegada - km_saida ELSE NULL END
  ) STORED,
  retirada_em timestamptz NOT NULL DEFAULT now(),
  devolucao_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_usage_select" ON public.vehicle_usage
  FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "vehicle_usage_insert" ON public.vehicle_usage
  FOR INSERT WITH CHECK (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor','operador']::org_role[])
  );
CREATE POLICY "vehicle_usage_update" ON public.vehicle_usage
  FOR UPDATE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor','operador']::org_role[])
  );
CREATE POLICY "vehicle_usage_delete" ON public.vehicle_usage
  FOR DELETE USING (
    get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['admin','gestor']::org_role[])
  );
```

### Arquivos a modificar/criar

1. **Novo: `src/hooks/useVehicleUsage.ts`**
   - Hook com queries e mutations para `vehicle_usage`

2. **`src/pages/VehiclesPage.tsx`**
   - Adicionar campo `cor` no dialog de edicao
   - Exibir cor no card do veiculo
   - Adicionar dialog de detalhes do veiculo com historico de usos (retirada/devolucao com KM)
   - Card de resumo com custo total estimado (soma KM x R$ 0,65)

3. **`src/pages/TransportsPage.tsx`**
   - Separar `renderFormFields` para nao mostrar observacoes no modo edicao

4. **`src/pages/VerEscalaPage.tsx`**
   - Pre-selecionar o usuario logado no filtro de membro
   - Adicionar botoes "Iniciar" / "Concluir" nos itens de transporte
   - Importar `useTransports` para ter acesso ao `update` mutation
   - Importar `useAuth` para obter o `user_id` logado
