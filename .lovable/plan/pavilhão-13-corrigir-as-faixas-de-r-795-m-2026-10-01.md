# Pavilhão 13: corrigir as faixas de R$ 795/m²

## O que encontrei
As faixas de preço especial do Pavilhão 13 ainda seguem a numeração antiga, antes da reorganização:
- Hoje recebem R$ 795: módulos 30–33, 50–57 e 74–77, além do 49, que foi ajustado à mão.
- O correto é: **27–30, 49–56 e 75–78**.
- Hoje, 27–29, 75 e 78 estão como R$ 776 por engano; 31–33, 57 e 74 estão como R$ 795 por engano.
- A 2ª Etapa tem o mesmo problema: R$ 875 está nas faixas antigas e R$ 854 nos demais.

## O que será feito
1. Mover as três faixas para 27–30, 49–56 e 75–78 nas duas etapas.
   - Renovação: R$ 795/m² nessas faixas e R$ 776/m² nos demais.
   - 2ª Etapa: R$ 875/m² nessas faixas e R$ 854/m² nos demais.
2. Tirar o ajuste manual do Módulo 49, porque a regra corrigida já dá R$ 795 a ele. Isso evita ter duas fontes para o mesmo preço.
3. Conferir os 104 módulos, um por um, e confirmar que nenhum fica sem preço ou com preço trocado.

## O que não muda
Nenhum dos módulos que mudam de preço tem venda: as 11 vendas em aberto ficam nos módulos 01–05 e 34–39 e continuam com o valor gravado. Áreas, números, status, cores e outros pavilhões também não mudam.

## Onde aparece
O novo preço vale automaticamente para a ficha do mapa, o carrinho, a finalização da venda, o menu Vendas e o dashboard. Os links públicos só mostram o novo preço depois que o app for publicado.

## Detalhes técnicos
- Fazer um UPDATE em `commercial_price_rules` (P13, as duas etapas), alterando `range_start`/`range_end` e `label` destes três ids de Renovação: 36a26b60 (30–33 → 27–30), c413f7d3 (50–57 → 49–56) e 08a41c7f (74–77 → 75–78), além das regras equivalentes da 2ª Etapa. Filtrar pelas faixas antigas para que a operação seja idempotente.
- Fazer um DELETE do override RENOVACAO do lote 6de9acf2 (B5-M049) e registrar `price_override_cleared` em `map_activity_logs`.
- Validar em `commercial_lot_pricing_2028`: o agrupamento por preço/m² deve dar 16 módulos a 795/875 e 88 a 776/854, com `resolution_status` OK em todos.
- Atualizar o teste da planta P13, se ele tiver as faixas fixadas no código.
