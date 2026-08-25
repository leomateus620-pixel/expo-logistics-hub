# Restaurar Pavilhão 5 (B8) — corrigir truncamento de 1000 linhas no mapa comercial

## Diagnóstico (confirmado)

O Pavilhão 5 não sumiu do banco: as 82 entidades (pavilhão + 81 módulos) existem, estão ativas, não arquivadas, e todas têm geometria corrente válida.

O problema é o **limite de 1000 linhas da API de dados** (PostgREST `max-rows`). O projeto tem **1.725 entidades ativas** e **1.730 geometrias correntes**, mas `fetchCommercialMap` busca tudo sem paginação. Teste direto na API com sessão autenticada confirmou o corte:

```text
map_entities retornadas: 1000 de 1725
B1: 189/189   B2: 5/186   B3: 258/257*  B4: 90/114
B5: 4         B6: 15/214  B8: 0/82      B10: 37/171
```

- **B8 (Pavilhão 5) fica 100% fora da fatia** → some completamente do mapa (externa e módulos internos).
- B2, B4, B6 e B10 também estão **parcialmente truncados** (módulos faltando), mesmo que o usuário ainda não tenha notado.
- A busca de geometrias (1.730 linhas) também é truncada: entidades retornadas sem geometria são descartadas no filtro `geometryByEntity.has(row.id)` (linha 554).

## Correção

Arquivo: `src/features/commercial-map/services/commercialMapService.ts`

1. **Adicionar helper de paginação** `fetchAllRows(query)`: executa a query em páginas de 1000 com `.order('id').range(from, from + 999)`, acumulando até retornar menos que a página (padrão já usado em `useCronogramaDashboardActivity.ts`).

2. **Aplicar o helper nas consultas sem limite:**
   - Modo completo (`fetchCommercialMap`, ~linhas 521–529):
     - `map_entities` (1.725 linhas)
     - `map_entity_geometries` (1.730 linhas)
     - `commercial_lots` (com embeds de preços/reservas/vendas — hoje cabe, mas paginar por segurança; se o embed complicar a paginação, paginar os lotes por faixa de `entity_id`)
   - Modo comissão (`fetchCommissionCommercialMap`, ~linhas 393–422):
     - `map_entities`, `map_entity_geometries`, `commercial_lots` (todas filtradas por `.in('entity_id', ...)`, então só paginar se necessário — segmentos têm < 1000 entidades; ainda assim aplicar o helper por consistência)

3. **Determinismo**: ordenar por `id` em todas as consultas paginadas para ordem estável entre páginas.

## Verificação

1. Repetir o teste REST autenticado: `map_entities` deve retornar 1.725 linhas (B8: 82/82, B2: 186/186, B4: 114/114, B6: 214/214, B10: 171/171).
2. Abrir `/mapa-comercial` no navegador (Playwright) e confirmar visualmente que o Pavilhão 5 aparece com a estrutura externa e os 81 módulos internos, sem regressão nos demais pavilhões.
3. Conferir console do navegador sem erros novos.

## Fora de escopo

- Nenhuma migration ou alteração de dados é necessária — o banco está íntegro.
- Nenhuma mudança visual/layout no mapa.
