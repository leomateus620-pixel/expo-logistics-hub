# Apagar todas as vendas de teste do menu Vendas

## Situação atual no banco
Existem **14 pedidos** registrados pelo menu Vendas. Eles envolvem **60 espaços**, e todos estavam **Disponíveis** antes da venda. Não há nenhuma venda fora desses pedidos.

| Comprador | Espaços | Situação |
|---|---|---|
| LEONARDO MATEUS STROSCHEIN | Q-D-09 a Q-D-12 (4) | Vendido |
| CLEO | Q-D-07 | Vendido |
| LEONARDO | B1-M001 a B1-M011 (11) | Vendido |
| LEO | B1-M101 a B1-M104 (4) | Vendido |
| DEBORA | B1-M065–068, M093, M137–140 (9) | Vendido |
| BOTOLI | Q-U-03, 05, 07, 09 (4) | Vendido |
| FENASOJA | Q-D-08 | Vendido |
| FENASOJA | Q-D-02, 04, 06 (3) | Vendido |
| CFL COMERCIO DE COSMETICOS LTDA | B1-M044 a M046 (3) | Vendido |
| CARPENEDO | Q-R-09 a Q-R-11 (3) | Vendido |
| JOAO | Q-T-01 a Q-T-04 (4) | Vendido |
| BIRCK | Q-F-01 a Q-F-08 (8) | Vendido |
| AGRIAÇO | Q-R-48, Q-R-49 (2) | Vendido |
| FEIRA NACIONAL DA SOJA | Q-L-04, 06, 08 (3) | Venda em aberto |

Atenção: **CFL Comércio de Cosméticos** e **Agriaço** parecem empresas reais. Com a aprovação deste plano, elas também serão apagadas como teste.

## O que será feito
Uma exclusão única, que ou apaga tudo ou não apaga nada:
1. Conferir antes os 14 pedidos e os 60 espaços. Se aparecer qualquer pedido novo ou diferente, a exclusão é cancelada.
2. Apagar as parcelas, os itens, as vendas, os contratos e as versões desses contratos, e as imagens (logos) das vendas, se houver.
3. Apagar também os 14 pedidos e só os registros de histórico ligados a essas vendas.
4. Voltar os 60 espaços para **Disponível** (verde).

## O que não muda
- Continuam iguais: regras, fluxos, telas, preços (inclusive os editados à mão), áreas, geometrias, IDs, links públicos e permissões.
- O cadastro de expositores é mantido para reaproveitar nas próximas vendas.

## Conferência depois
- Zero pedidos, vendas e parcelas no banco. Nenhum espaço fica como Vendido ou Venda em aberto.
- O mapa, o Painel e os links públicos mostram os 60 espaços como disponíveis.
- Nada será publicado.
