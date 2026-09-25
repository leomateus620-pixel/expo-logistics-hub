# Zerar vendas de teste da Exporural

## O que existe hoje (conferido no banco)
5 pedidos de venda confirmados, todos só com lotes da Exporural (Quadras R e S), 13 lotes vendidos:

| Comprador | Lotes |
|---|---|
| SOLTIS | Q-R-01, Q-R-02, Q-R-14 |
| FEIRA NACIONAL DA SOJA | Q-S-03, Q-S-04 |
| FENASOJA PALCO SEMEAR | Q-R-56, Q-R-57, Q-R-58, Q-R-59 |
| FENASOJA ÁREA DE LAZER E BANHEIROS | Q-S-25 |
| ENCERRAMENTO COLHEITA DA SOJA 2028 | Q-S-19, Q-S-20, Q-S-21 |

Nenhum desses pedidos inclui lotes de outros segmentos.

## O que será feito
Uma exclusão única e transacional (tudo ou nada), igual à limpeza de testes feita antes:
1. Apagar parcelas, itens, vendas e os 5 pedidos acima.
2. Apagar contratos/versões ligados a essas vendas, se existirem.
3. Remover só os registros de histórico/atividade referentes a essas vendas.
4. Voltar os 13 lotes para **Disponível**.

## O que NÃO muda
Lotes, áreas, geometrias, IDs, preços (inclusive valores manuais), regras, links públicos, vendas de outros segmentos, permissões.

## Conferência depois
- Zero vendas e zero lotes vendidos nas Quadras R e S.
- Contagem de vendas dos outros segmentos idêntica à de antes.
- Mapa, Dashboard e links públicos mostrando os lotes como disponíveis (sem F5; público em até 30 s).

Nada será publicado.
