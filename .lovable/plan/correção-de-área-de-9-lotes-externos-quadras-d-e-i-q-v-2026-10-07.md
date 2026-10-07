# Correção de área de 9 lotes externos (Quadras D, E, I, Q, V)

## Situação confirmada no banco
Os nove lotes têm identificação única no projeto do mapa comercial Fenasoja e foram encontrados pela combinação de quadra e número, não só pelo número. Nenhum deles foi corrigido ainda. A área atual no banco coincide com a revisão de referência, e não há nada ligado comercialmente a eles: são lotes disponíveis, sem venda, reserva, negociação, pedido, contrato ou preço manual.

| Lote | ID | Área atual | Área final | Diferença | Regra (Renov. / 2ª etapa) | Renovação antes → depois | 2ª etapa antes → depois |
|---|---|---|---|---|---|---|---|
| Q-D-01 | f41d47a4… | 208,20 | 194,30 | −13,90 | D esquina, R$ 55 / 61 | 11.451,00 → 10.686,50 | 12.700,20 → 11.852,30 |
| Q-D-03 | e85903d0… | 209,11 | 195,25 | −13,86 | D, R$ 42 / 46 | 8.782,62 → 8.200,50 | 9.619,06 → 8.981,50 |
| Q-D-05 | d871062c… | 208,96 | 193,57 | −15,39 | D, R$ 42 / 46 | 8.776,32 → 8.129,94 | 9.612,16 → 8.904,22 |
| Q-D-07 | d848e55c… | 208,80 | 194,98 | −13,82 | D, R$ 42 / 46 | 8.769,60 → 8.189,16 | 9.604,80 → 8.969,08 |
| Q-E-12 | 47c63b52… | 175,72 | 174,12 | −1,60 | E, R$ 42 / 46 | 7.380,24 → 7.313,04 | 8.083,12 → 8.009,52 |
| Q-I-01 | e54e172f… | 205,97 | 204,37 | −1,60 | I esquina, R$ 55 / 61 | 11.328,35 → 11.240,35 | 12.564,17 → 12.466,57 |
| Q-I-15 | 87606a23… | 209,31 | 207,71 | −1,60 | I esquina, R$ 55 / 61 | 11.512,05 → 11.424,05 | 12.767,91 → 12.670,31 |
| Q-Q-06 | 586ad822… | 190,98 | 189,38 | −1,60 | Q esquina, R$ 42 / 46 | 8.021,16 → 7.953,96 | 8.785,08 → 8.711,48 |
| Q-V-06 | 3aabd05c… | 240,65 | 239,05 | −1,60 | V esquina, R$ 42 / 46 | 10.107,30 → 10.040,10 | 11.069,90 → 10.996,30 |

Todas as áreas estão em m² e todos os preços em R$.

- **Seis lotes do primeiro pedido:** passam de 1.231,59 para 1.208,20 m², redução de 23,39 m². A redução do Q-D-05 é de 15,39 m², e não 1,60 m²; essa diferença fica registrada como divergência, conforme o seu pedido.
- **Nove lotes no total:** passam de 1.857,70 para 1.792,73 m², redução de 64,97 m².
- **Não alterados:** o Q-D-06, que tem a mesma área de 208,96 m², e todos os outros lotes.
- **Preços acima:** são a previsão calculada com a regra vigente (área × preço por m², arredondado em centavos). Os valores finais serão os lidos no banco depois da gravação.

## Como a correção será aplicada
1. **Cadastro oficial do lote:** usar o mesmo fluxo autorizado de edição de lote, um lote por vez. Esse fluxo confere permissão e versão, guarda o histórico e registra área anterior, área final, motivo, autor e data. A gravação vai no seu nome, depois de confirmar a sua conta.
   - Se algum lote tiver mudado desde a leitura, ele é interrompido e informado, nunca sobrescrito.
   - Repetir a operação mantém os mesmos valores, sem reduzir de novo.
   - Situação de venda, numeração, quadra, polígono e posição não mudam.
2. **Ficha do mapa:** atualizar também a área oficial registrada na ficha de cada lote no mapa, com a observação "área corrigida conforme folha 2026-10-07", para que uma reconstrução não traga a área antiga de volta.
3. **Referência no código:** atualizar a tabela de áreas oficiais dos lotes externos com as nove áreas finais, além dos subtotais das quadras D, E, I, Q e V e do total geral, que cai em 64,97 m². Os testes passam a conferir os novos valores e que o Q-D-06 continua com 208,96 m².
4. **Preços:** são calculados automaticamente a partir da área oficial e da regra vigente de cada lote, para renovação e segunda etapa. A rotina geral de preços não será executada, e não existe preço manual nesses lotes para preservar.
5. **Vendas:** não há carrinho, pedido, contrato, parcela ou recebimento a revisar.

## Propagação
- **Mapa, lista, busca, painel e carrinho:** leem a área e o preço oficiais. Mudar o lote altera a versão do mapa, o que faz as sessões abertas recarregarem.
- **Links públicos:** vou conferir que mostram os mesmos valores, mantendo o escopo de acesso atual.
- **Dashboard:** os totais de área e os valores de tabela recalculam pelos agrupamentos que já existem. Os totais de vendas e de receita não mudam, e a quantidade de lotes também não.
- **Financeiro 2028:** não consome esses valores de tabela, então não é afetado.

## Validação
- Ler os nove lotes no banco depois da gravação: área com duas casas decimais, preço por etapa e registro no histórico.
- Repetir a mesma operação para confirmar que nada muda.
- Testar um conflito de versão em operação desfeita no final.
- Confirmar que nenhum lote fora dos nove mudou, comparando a contagem e a soma de áreas antes e depois.
- Abrir o mapa e um link público numa sessão nova, conferir a dashboard e rodar os testes de áreas e preços.
- O relatório final separa o que mudou no código, o que foi aplicado ao banco, o que foi conferido na tela e o que ainda depende de publicação. Não publico sem o seu pedido.

## Detalhes técnicos
- **Edição do lote:** `update_commercial_lot(p_lot_id, p_expected_updated_at, p_patch, p_reason)`, executado como o usuário solicitante (claims JWT, `SET LOCAL ROLE authenticated`) em uma transação por lote. O patch repete os campos atuais e altera só `officialAreaSqm`. A versão esperada é o `updated_at` lido agora.
- **Preço materializado:** a função recria a linha ativa de `lot_prices`. Hoje ela está como `NOT_FOR_SALE/MANUAL`, e o modo é mantido igual. O preço comercial vem da view `commercial_lot_pricing_2028`, que usa `security_invoker`.
- **Ficha do mapa:** `map_entities.metadata.officialAreaSqm` é atualizado para os nove `entity_id`, com `areaCorrection` contendo o valor anterior, o motivo e a data.
- **Arquivos:** `src/features/commercial-map/data/externalLotOfficialAreas.ts` e o teste `src/test/externalLotOfficialAreas.test.ts`.
