## Auditoria de Veículos Botolli — KM e Custo Estimado

### 1. Como o sistema calcula hoje

- **Custo estimado** = `KM Rodados × R$ 0,65` (constante `FUEL_COST_PER_KM` em `VehiclesPage.tsx`).
- **KM Rodados** vem **exclusivamente** de `vehicle_usage.km_rodados` (coluna `GENERATED ALWAYS AS km_chegada - km_saida`), via `useVehicleUsage`.
- Cada transporte concluído gera 2 registros automáticos em `vehicle_usage` ("Ida automática" + "Volta automática"), cuja soma deveria igualar `transports.km_devolucao - km_retirada`.
- O odômetro `vehicles.km_atual` é editado manualmente (form de edição) e não é recalculado automaticamente.

A fórmula em si está **correta** (R$ 0,65/km × Σ km_rodados). O problema é de **dados/integridade**, não de cálculo.

### 2. Achados da auditoria (dados reais hoje)

```text
placa    | km_atual | Σ usage | min_saida | max_chegada | diagnóstico
---------+----------+---------+-----------+-------------+----------------------------------
IXU8B21  |  124065  |    178  |  123799   |   124065    | OK (max_chegada == km_atual)
IZH9J56  |  125616  |    212  |  125386   |   125616    | OK
IZT7H43  |   87769  |    638  |       0   |    87769    | INCONSISTENTE — usage com km_saida=0/280/560 (backfill ruim)
JDF6D47  |   25952  |    143  |   25668   |    25811    | km_atual avançou 141 km sem usage fechado correspondente
TQW2A80  |       0  |      0  |     —     |      —      | odômetro nunca informado
TQX7C18  |    5347  |   1206  |    4403   |    5325     | OK estrutural (Σ ≈ 5325-4403 = 922; mas há sobreposições, ver abaixo)
(sem placa) DEFENDER 4X4 | 0 | 0 | — | — | veículo sem placa
```

**Inconsistências confirmadas:**

a) **IZT7H43 (T-CROSS)** — transporte `9da9dd3c…` (Aeroporto) tem `km_retirada=0` e `km_devolucao=560`, gerando 2 usages `0→280` e `280→560`. Como o veículo já estava em ~86.700 km, esses 560 km estão **isolados do resto do odômetro** e somam 560 km falsos no custo estimado.

b) **IZT7H43** — transporte `c70dc388…` tem `km_devolucao=87743` mas o usage "Volta automática" gravou `km_chegada=87737` (divergência de 6 km entre `transports` e `vehicle_usage`).

c) **IZT7H43** — usages manuais com sobreposições:  
   • `87691→87708 (17km)` E `87691→87694 + 87694→87697 (auto, 6km)` no mesmo período → mesmas KMs contadas 2x.  
   • `87760→87769 (9km)` sobrepõe `87760→87763→87766` (auto) → contagem dupla.

d) **TQX7C18 (T-CROSS)** — usage manual `5039→5323 (284 km)` sobrepõe o transporte automático `5039→5182 (143 km)` no mesmo intervalo → contagem dupla de ~143 km.

e) **JDF6D47 (AMAROK)** — `km_atual=25952` mas último usage fechado é `25811` e há um usage aberto começando em `25952` ("Imigrantes centro civico"). Há um transporte `em_andamento` que retirou em `25952` com estimativa 630 km. Diferença `25952-25811=141 km` foi rodada **sem registro de uso fechado**.

f) **Custo estimado global** está atualmente inflado por: 560 km falsos do IZT7H43 + ~143 km duplicados do TQX7C18 + ~26 km duplicados do IZT7H43 ≈ **~730 km × R$ 0,65 ≈ R$ 475 a mais** no card "Custo Estimado".

g) **Veículos zerados**: `TQW2A80 (SAVEIRO)` e `DEFENDER 4X4 (sem placa)` têm `km_atual=0` — não entram no custo, mas distorcem qualquer média futura.

### 3. Plano de correção

#### 3.1 Correções de dados (migrations / inserts)

1. **Excluir os 2 usages órfãos do transporte `9da9dd3c…` (IZT7H43)** — `km_saida=0/280` claramente errados (backfill antigo). Manter o registro do transporte mas zerar `km_retirada/km_devolucao` ou substituir pelos valores reais se conhecidos. Como não temos o odômetro real, o mais seguro é **deletar os 2 usages** e marcar a observação do transporte como "KM não consolidado".
2. **Reconciliar usages manuais sobrepostos do IZT7H43 e TQX7C18**: deletar os manuais que duplicam intervalos já cobertos por usages automáticos (`87691→87708`, `87760→87769`, `5039→5323`).
3. **Corrigir o usage automático `c70dc388…`** para `km_chegada=87743` (alinhar com `transports.km_devolucao`).
4. **JDF6D47**: criar um usage fechado `25811→25952` para preencher o gap (ou pedir ao usuário a justificativa).

> Todas essas operações de UPDATE/DELETE serão feitas via migration (apenas SELECT/INSERT são permitidos com a conexão atual).

#### 3.2 Correções no app (`VehiclesPage.tsx`, hooks)

1. **Validação anti-sobreposição** em `vehicle_usage`: ao criar/editar um usage manual, verificar se o intervalo `[km_saida, km_chegada]` se sobrepõe a outro usage do mesmo veículo, e bloquear/avisar.
2. **Sincronizar `vehicles.km_atual` automaticamente**: trigger ou hook que atualiza `km_atual = max(km_chegada)` sempre que um usage é fechado. Hoje pode ficar defasado ou à frente.
3. **KPI "Coerência odômetro"**: novo card/badge no detalhe do veículo mostrando `Σ km_rodados` vs `(km_atual − odômetro_inicial)` para flagrar divergências.
4. **Tratar `km_retirada=0`** no edge function `transport-lifecycle`: nunca gerar usages se `km_retirada` for 0 ou nulo — em vez disso marcar o transporte como "pendente de KM".
5. **Excluir do Custo Estimado os veículos sem `km_atual` definido** ou destacar separadamente "frota sem odômetro".

#### 3.3 Relatório de auditoria por veículo

Adicionar no Dialog de detalhe (ou no PDF) uma seção **"Conferência de Odômetro"** com:
- Odômetro inicial (primeiro `km_saida` registrado)
- Odômetro atual (`vehicles.km_atual`)
- Σ km_rodados (vehicle_usage)
- Diferença esperada vs real, em verde/vermelho

### 4. Detalhes técnicos

Arquivos impactados:
- `src/pages/VehiclesPage.tsx` — adicionar bloco de coerência, ajustar KPI, exibir aviso se há divergência.
- `src/hooks/useVehicleUsage.ts` — adicionar validação de sobreposição na mutation `createUsage/updateUsage`.
- `src/hooks/useVehicles.ts` — após fechar usage, atualizar `km_atual` se necessário.
- `supabase/functions/transport-lifecycle/index.ts` — não criar usages quando `km_retirada` ausente/zero.
- Nova migration SQL para limpar os usages problemáticos listados em 3.1.

### 5. Confirmações antes de executar

Antes de aplicar, preciso confirmar com você:

1. **IZT7H43 — transporte Aeroporto `9da9dd3c…` (560 km falsos)**: posso deletar os 2 usages automáticos e zerar os campos km_retirada/km_devolucao do transporte? (Sem o odômetro real, é a única forma de não inflar o custo.)
2. **Usages manuais sobrepostos** (IZT7H43 `87691→87708`, `87760→87769`; TQX7C18 `5039→5323`): posso deletar para evitar contagem dupla?
3. **JDF6D47 gap de 141 km**: criar um usage genérico `25811→25952` "Ajuste odômetro", ou deixar o gap?
4. **Veículos sem placa/odômetro** (DEFENDER, SAVEIRO): mantém ocultos do Custo Estimado, ou exclui da listagem?
