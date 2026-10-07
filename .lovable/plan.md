# Correção da tabela de preços Exporural 2028 (Quadras R e S)

## O que foi encontrado no banco
- **Lotes:** 65 lotes numerados na quadra R (R/01–R/65) e 35 na S (S/01–S/35), 100 no total. Nenhum está duplicado ou faltando.
- **Fora da correção:** 3 lotes arquivados (que não entram) e a área sem número EXPORURAL-AREA-56878, que tem regra própria e não será alterada. Não existe um S/36 ativo.
- **Vendas confirmadas:** nenhum lote R ou S tem venda confirmada.
- **Vendas em aberto:** R/03, R/04 e R/14. Os pedidos e as parcelas não serão recalculados.
- **Regras atuais:** são seis faixas de preço, cada uma com valor para renovação e para segunda etapa, todas com a mesma prioridade e sem regra concorrente:

| Faixa atual | Renovação | 2ª etapa | Correção |
|---|---|---|---|
| R/01–12 | 27,50 | 30,00 | 2ª etapa passa a 30,25 |
| R/13–40 | 24,20 | 27,00 | faixa passa a terminar em R/39; 2ª etapa passa a 26,60 |
| R/41–65 | 16,50 | 18,00 | faixa passa a começar em R/40; 2ª etapa passa a 18,15 |
| S/01–36 | 11,00 | 12,00 | faixa passa a terminar em S/35; renovação 14,00 e 2ª etapa 15,40 |

Os valores estão em R$/m².

- **R/40:** hoje está na faixa errada (24,20 / 27,00) e passa para 16,50 / 18,15.
- **R/62 e R/63:** têm valores manuais de R$ 0,00 nas duas etapas, lançados em 25/09 por leomateus620@gmail.com, sem negociação, pedido ou contrato ligado. Hoje esses dois lotes aparecem como "R$ 0,00". Os valores manuais serão removidos pelo fluxo oficial de "restaurar valor", que fica registrado no histórico, e os lotes voltam a usar a tabela.
- **Etapas que já estavam corretas:** a renovação de R/01–R/39 e de R/41–R/65.

## Correção
1. **Ajustar as regras existentes:** os seis pares de regras recebem as novas faixas e valores, sem criar regras novas nem duplicadas. Os nomes também mudam, por exemplo "Lotes 40 a 65" e "Lotes 01 a 35". Os valores e faixas anteriores ficam registrados no campo de observação de cada regra e em um arquivo de reversão.
2. **Remover os valores manuais zerados de R/62 e R/63**, com histórico, e em nome de leomateus620@gmail.com, o mesmo administrador que os lançou.
3. **Conferir de novo antes de gravar:** se algum lote R ou S tiver sido confirmado como vendido, ele recebe um valor manual com o preço atual para ficar congelado. Isso usa o mesmo mecanismo de valor manual por lote, e a venda não é tocada.
4. **Vendas em aberto (R/03, R/04, R/14):** o preço de tabela exibido muda, apenas na segunda etapa:
   - R/03: 19.500,00 → 19.662,50
   - R/04: 19.342,50 → 19.503,69
   - R/14: 24.214,95 → 23.856,21

   O valor negociado do pedido, as parcelas e os contratos ficam como estão. A dashboard continua mostrando o valor negociado nas vendas.
5. **Repetir a correção não muda nada:** cada atualização compara com os valores finais, e a remoção do valor manual só age se ele existir.
6. **Rotina geral:** a rotina geral de preços não será executada.

## Validação
- Comparar os 100 lotes com a tabela, nas duas etapas, com atenção especial a R/12, R/13, R/39, R/40, R/59, R/60, R/62, R/63, R/65, S/01 e S/35.
- Confirmar que cada lote cai em exatamente uma regra, sem empate.
- Confirmar que os totais são área oficial × tarifa, arredondados em centavos.
- Confirmar que nenhum lote fora de R e S teve o preço alterado, comparando todos os preços antes e depois.
- Confirmar que a área EXPORURAL-AREA-56878 continua com 27,50 / 30,25.
- Abrir o mapa numa sessão nova e um link público, e conferir a dashboard.
- Rodar os testes de preços.
- Nenhuma venda ou contrato de teste será criado.
- O relatório final separa o que foi aplicado no banco do que foi conferido na tela. Não publico sem o seu pedido; como a mudança é só no banco, não há código para publicar.

## Detalhes técnicos
- Atualizar `commercial_price_rules` pelos IDs (0aeae0d8, fbbc287d, a8bdb99e, c6ff5cac, 552e1038, 81d78933, f9ddbbe7, 11c343b6): `range_start`, `range_end`, `price_per_sqm`, `label` e `notes`, com o estado anterior em `notes`, numa única transação.
- `clear_lot_price_override` para R/62 e R/63 nas duas etapas, executado com as claims do administrador.
- Reversão em `docs/performance/rollback_exporural_rs_pricing_2026-10-07.sql`.
- Os totais vêm da view `commercial_lot_pricing_2028`. O front-end já lê o cache de preços por projeto, e a assinatura de revisão do mapa recarrega as sessões abertas.
