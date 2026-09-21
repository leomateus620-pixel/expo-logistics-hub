# Correção de esquina — Q-E-13, Q-E-11, Q-D-12, Q-D-11

## Estado atual confirmado (consultado agora no banco)

Os quatro lotes existem, estão disponíveis, com área validada, e hoje estão classificados como lote normal:

| Lote | Área oficial | is_corner | Auditoria de esquina |
|---|---|---|---|
| Q-E-13 | 165,88 m² | não | NOT_CORNER |
| Q-E-11 | 179,49 m² | não | NOT_CORNER |
| Q-D-12 | 248,99 m² | não | NOT_CORNER |
| Q-D-11 | 263,74 m² | não | NOT_CORNER |

Cada um já possui registro de auditoria (nenhum precisa ser criado do zero, mas a operação será feita como UPSERT mesmo assim).

As regras oficiais de esquina já existem para as duas quadras e são idênticas entre D e E:

- Renovação (esquina): R$ 55,00 / m² — prioridade 80
- 2ª Etapa (esquina): R$ 61,00 / m² — prioridade 80
- (normal hoje aplicado: R$ 42,00 e R$ 46,00 / m²)

O motor oficial de preços é uma visão calculada que já escolhe sozinha a regra de esquina quando a auditoria diz `CORNER_CONFIRMED`, e o total é sempre área × preço/m². Ou seja: **não é preciso escrever nenhum preço**. Basta corrigir a classificação e os valores passam a sair certos em toda a cadeia.

## Totais resultantes esperados

| Lote | Renovação (55) | 2ª Etapa (61) |
|---|---|---|
| Q-E-13 (165,88) | R$ 9.123,40 | R$ 10.118,68 |
| Q-E-11 (179,49) | R$ 9.871,95 | R$ 10.948,89 |
| Q-D-12 (248,99) | R$ 13.694,45 | R$ 15.188,39 |
| Q-D-11 (263,74) | R$ 14.505,70 | R$ 16.088,14 |

## O que será feito

1. **Migração idempotente restrita aos quatro identificadores** (nunca por posição, nunca "primeiro/último lote"):
   - marcar `is_corner = true` nos quatro lotes;
   - UPSERT da auditoria para `CORNER_CONFIRMED`, com nota de origem (correção oficial manual) e data de auditoria, preservando as evidências já registradas;
   - reexecução não altera mais nada.
2. **Nada mais é escrito**: preço, total, geometria, área, número, quadra, status e disponibilidade ficam intactos; nenhuma regra global é tocada; nenhum outro lote das quadras D e E é alterado.
3. **Validação por lote, no banco**, conferindo `corner_confirmed = true`, `resolution_status = OK`, preço/m² de esquina nas duas etapas e total = área × preço.
4. **Validação de não-regressão**: conferir antes/depois todos os demais lotes das quadras D e E (classificação e os dois preços/m²) e confirmar diferença zero fora dos quatro.
5. **Teste automatizado** cobrindo a classificação dos quatro lotes e os totais das duas etapas, garantindo que a regra de esquina é a única fonte.

## Propagação (sem regra paralela)

Painel do lote no mapa, "Esquina: Sim", Modo Vendas, seleção múltipla/subtotal, checkout, rotas públicas, ficha pública e inventário público leem todos da mesma origem: `commercial_lots.is_corner` para a identificação e a visão oficial de preços para os valores. Como a correção acerta exatamente essas duas origens, a propagação é automática — será conferida lote a lote (mapa, vendas e link público) após a migração.

## Detalhes técnicos

- Migração aplicada via ferramenta de migração, transacional, filtrando `public_identifier IN ('Q-E-13','Q-E-11','Q-D-12','Q-D-11')` e checando ao final que exatamente 4 linhas foram afetadas.
- `commercial_lot_corner_audit`: UPSERT em `lot_id` com `classification = 'CORNER_CONFIRMED'`, `db_is_corner = true`, `method` preservado ou marcado como revisão oficial, `audited_at = now()`.
- `commercial_lot_pricing_2028` é view derivada — nenhuma escrita direta; `lot_prices` também não é tocado.
- Sem alteração de geometria (`map_entity_geometries`) e sem versionamento novo.
- Nada será publicado.
