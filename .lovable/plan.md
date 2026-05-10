## Correções no Dashboard — KM Transportes & Horas Carrinhos

### 1. KM PERÍODO dos Transportes (corrigir -24.220)

**Causa:** o cálculo atual `Σ(km_devolucao - km_retirada)` fica negativo porque 27 dos 30 transportes concluídos têm `km_retirada > 0` mas `km_devolucao = 0`.

**Correção:** trocar a fonte do KM total da aba "Transportes" pelo total do hook `useVehicleOdometerEvent` (5.811 km — soma dos deltas dos 5 carros do evento). Assim o card KM PERÍODO passa a refletir o KM real percorrido pela frota.

**Adicionar card "Combustível R$":** novo KPI ao lado de KM PERÍODO mostrando `Σ valor` de `fuel_records` no período (já disponível em `useFuelMetrics`).

### 2. Transportes "perímetro urbano" (criação automática)

**Lógica:** para cada transporte concluído sem `km_devolucao` válido (ou `km_devolucao - km_retirada ≤ 0`), criar automaticamente um registro complementar `transports` com:
- `titulo`: "Trecho urbano — <destino original>"
- `origem`: Parque de Exposições Alfredo Leandro Carlson
- `destino`: "Perímetro urbano — Santa Rosa"
- `status`: 'concluido'
- `km_retirada` = 0, `km_devolucao` = 15 (ida+volta dentro de Santa Rosa)
- `observacoes`: "Lançamento automático — diferença de odômetro"
- `inicio_em` / `fim_em` herdados do transporte original

**Execução:** uma única migration de dados (insert) cria os ~27 registros faltantes agora. Para futuro, o cálculo passa a usar `useVehicleOdometerEvent`, então não precisa repetir.

### 3. Carrinhos elétricos — fechar tudo em 19:00 hoje

**Causa do "180h":** existem 14 carrinhos com `status='em_uso'` há vários dias sem `devolucao_em`. O cálculo atual só conta pares retirada→devolução com intervalo < 48h, descartando o restante.

**Correção (banco):**
1. Para cada carrinho `em_uso`: setar `devolucao_em = '2026-05-10 19:00:00-03'`, `status = 'disponivel'`, limpar `responsavel_user_id`/`empresa_slug`/`tipo_responsavel`/`nome_externo`.
2. Inserir um registro em `cart_history` com `action='devolucao'` e `created_at = '2026-05-10 19:00:00-03'` para cada um, garantindo que entre no cálculo de horas.

**Correção (lógica do dashboard):** remover o teto rígido de 48h em `useDashboardMetrics.ts` (linha 107) — usar limite de 14 dias (período do evento). Isso garante que retiradas longas legítimas sejam contabilizadas.

### Arquivos alterados

- **Migration de dados** (insert tool):
  - UPDATE `electric_carts` em_uso → disponível, devolucao_em=10/05 19:00
  - INSERT em `cart_history` (devolucao para cada carrinho fechado)
  - INSERT em `transports` (~27 registros urbanos automáticos)
- **`src/hooks/useDashboardMetrics.ts`:**
  - Trocar `trKmTotal` por soma vinda de `useVehicleOdometerEvent`
  - Aumentar limite de horas/par carrinho de 48h para 336h (14 dias)
  - Expor `combustivelTotalBRL` no bloco transports
- **`src/pages/Dashboard.tsx`:**
  - Adicionar card "COMBUSTÍVEL R$" no perfil Transportes
  - Card KM PERÍODO continua, mas com valor positivo correto

### Resultado esperado

- KM PERÍODO Transportes: ~5.811 km (positivo)
- Combustível R$: total real do `fuel_records` no período
- Horas carrinhos: muito acima de 180h, contabilizando todo o período do evento até 19:00 de hoje
- Lista de transportes ganha ~27 entradas "Trecho urbano — …" como histórico auditável da diferença
