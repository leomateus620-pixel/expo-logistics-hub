# Indicadores da Dashboard Comercial

## Resultado
- Criar um indicador de **valor das vendas confirmadas** em destaque, ao lado dos valores em andamento e do valor total comercial dos lotes.
- Aplicar a direção **Elegant financial matrix** escolhida: matriz financeira em primeiro plano, inventário e metragem em indicadores secundários, números mais legíveis e textos curtos.
- Usar grafite claro/escuro com acentos dourado e azul e tipografia Sora/Manrope, conforme as escolhas visuais. Manter a leitura responsiva no celular.
- Mostrar claramente quando um total é parcial, sem confundir valor de venda confirmada com dinheiro recebido. Preservar filtros e demais áreas da Dashboard.

## Detalhes técnicos
- Usar `overall.soldValue` e `overall.byStatus.SOLD.pricedLotCount` já calculados a partir de vendas CONFIRMED por lote; não inferir valores ausentes da tabela de preços. Manter `saleOpenValue` separado e `totalKnownValue` com seu escopo atual.
- Alterar apenas a apresentação dos indicadores na Dashboard e seus estilos/tokens; adaptar os testes para três valores, coberturas incompletas, zero válido, troca de etapa e atualização dos dados.
- Conferir a apresentação em larguras desktop e móvel e rodar os testes focados. Não alterar vendas, preços, contratos, permissões ou banco e não publicar.
