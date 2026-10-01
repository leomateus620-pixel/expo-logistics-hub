# Marcar 6 lotes do Espaço do Automóvel como esquina

## O que foi verificado
- Os 6 lotes (Q-T-02, Q-T-10, Q-T-12, Q-U-02, Q-U-10, Q-U-12) estão hoje como "não esquina", tanto no lote quanto na auditoria de esquinas.
- Todos estão Disponíveis, sem vendas, pedidos ou valores editados manualmente.
- A regra oficial de esquina das Quadras T e U já existe e já vale para os lotes 01, 09 e 11: Renovação R$ 32,00/m² e 2ª Etapa R$ 35,00/m² (normal: R$ 28 / R$ 31).

## Resultado esperado

| Lote | Área | Renovação | 2ª Etapa |
|---|---|---|---|
| Lote 02 · Quadra T | 192,91 m² | R$ 6.173,12 | R$ 6.751,85 |
| Lote 10 · Quadra T | 192,91 m² | R$ 6.173,12 | R$ 6.751,85 |
| Lote 12 · Quadra T | 244,51 m² | R$ 7.824,32 | R$ 8.557,85 |
| Lote 02 · Quadra U | 192,91 m² | R$ 6.173,12 | R$ 6.751,85 |
| Lote 10 · Quadra U | 192,91 m² | R$ 6.173,12 | R$ 6.751,85 |
| Lote 12 · Quadra U | 244,51 m² | R$ 7.824,32 | R$ 8.557,85 |

A ficha, o carrinho, os relatórios e os links públicos passam a mostrar "Esquina: Sim" e a regra "(esquina)", sem mudar nada no visual.

## Passos
1. Atualizar só esses 6 lotes: marcar como esquina e registrar a nova classificação confirmada na auditoria de esquinas (com observação "confirmado pelo usuário em 01/10/2026"), guardando a classificação anterior.
2. Conferir no banco que os preços resolvidos batem com a tabela acima e que os demais lotes T/U não mudaram.
3. Adicionar teste com esses 6 lotes e totais esperados.
4. Abrir a ficha de um lote no navegador para ver o selo de esquina e os novos valores.

## Detalhes técnicos
- Alteração de dados via `run_sql` (UPDATE em `commercial_lots.is_corner` e em `commercial_lot_corner_audit` com `classification='CORNER_CONFIRMED'`, `db_is_corner=true`, `method='MANUAL_USER_CONFIRMATION'`), filtrada pelos 6 `lot_id` exatos; idempotente.
- Nenhuma regra, área, geometria, rota, venda ou link é alterado; a view `commercial_lot_pricing_2028` passa a resolver a regra de esquina já existente.
- Sem publicação.
