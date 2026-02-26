
Objetivo: corrigir o cálculo do campo “Custo estimado combustível” para usar exatamente **Total KM rodados × 0,65**.

Passos de implementação:
1. Revisar `src/pages/VehiclesPage.tsx` e centralizar a regra em constante:
   - `const FUEL_COST_PER_KM = 0.65`
   - `const custoEstimado = Number(totalKm || 0) * FUEL_COST_PER_KM`
2. Garantir que `totalKm` venha limpo de `src/hooks/useVehicleUsage.ts`:
   - somar apenas valores numéricos válidos de `km_rodados`
   - ignorar `null`, `undefined` e `NaN` para evitar inflação no total
3. Padronizar exibição no card:
   - manter `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`
   - manter legenda “R$ 0,65/km” coerente com a constante
4. Validar com cenário real:
   - conferir exemplo: 100 km → R$ 65,00
   - conferir 0 km → R$ 0,00
   - conferir atualização após concluir devolução/uso

Detalhes técnicos (direto ao ponto):
- Arquivos: `src/pages/VehiclesPage.tsx`, `src/hooks/useVehicleUsage.ts`
- Sem migração de banco para esta correção
- Regra final obrigatória: `custoEstimado = totalKm * 0.65`
