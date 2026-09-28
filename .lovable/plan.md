# Legenda comercial única em quatro fases

## Resultado esperado
- Em mapa, Modo Vendas, pavilhões, painéis, listas, dashboard e links públicos, mostrar apenas **Disponível (verde)**, **Venda em aberto (amarelo forte)**, **Vendido (azul forte)** e **Bloqueado (vermelho)** nas legendas e nos filtros visuais. Os totais por fase devem continuar correspondendo aos lotes reais; seleção e realce não alteram a cor-base.
- Remover as entradas antigas “Reservado”, “Negociação” e “Indisponível” das legendas repetidas e dos controles de fases. Áreas de apoio não comerciais continuam neutras, sem serem contadas como lotes bloqueados.

## Trabalho
1. Centralizar a apresentação de quatro fases e a correspondência de filtros em uma única regra reutilizável. Manter os estados operacionais reais de reserva, negociação e indisponibilidade no cadastro e suas restrições; nunca apresentar reserva/negociação como venda em aberto ou contrato assinado. Se houver registros antigos desses estados, preservar a indicação operacional na ficha individual, sem criar uma quinta cor na legenda comercial. Não alterar dados de vendas nem permissões.
2. Atualizar a legenda contextual do parque e pavilhões, filtros da lista, resumo lateral, minimapas, gráficos e tabelas do dashboard para usar a mesma lista de quatro fases, sem controles de status antigos. Evitar exibir a mesma legenda de situações duas vezes ao abrir a ficha/planta, mantendo informações arquitetônicas distintas quando pertinentes.
3. Uniformizar a pintura das superfícies de lotes e módulos nas vistas normais e no Modo Vendas com a paleta central; contornos de seleção, acesso e segmentos permanecem distinguíveis. Cadeados e logos seguem restritos aos lotes efetivamente vendidos.
4. Corrigir a legenda dos links públicos: quatro nomes e quatro cores, em especial **Bloqueado** em vermelho no lugar de “Indisponível”; adaptar apresentação dos status recebidos sem ampliar o conjunto de dados públicos, trocar links ou expor informações internas. Conservar a atualização automática existente.
5. Cobrir por testes as quatro fases, contagens, filtros, ausência de entradas antigas/duplicadas, estados operacionais legados sem venda fictícia, mapas internos e externos e links públicos. Conferir visualmente desktop e mobile e verificar a compilação; não registrar vendas de teste na base oficial e não publicar.

## Detalhes técnicos
- O cadastro ativo consultado nesta revisão tem 1.414 lotes `AVAILABLE` e 57 `SOLD`; não há registros ativos em `RESERVED`, `IN_NEGOTIATION`, `UNAVAILABLE` ou `SALE_OPEN` neste momento. Os estados antigos aparecem por listas fixas no `ContextualMapLegend`, `MapPanels`, `EntityExplorer`, gráficos/tabelas e minimapa; a legenda pública ainda mostra `RESERVED` e o nome “Indisponível” para a cor de `BLOCKED`.
- Preservar os sete códigos internos enquanto a camada de apresentação usa as quatro fases; a lógica de elegibilidade e as funções de confirmação/cancelamento não serão alteradas. Revisar o mapeamento de filtros para que a fase exibida e os resultados coincidam sem classificar indevidamente uma reserva como lote livre para venda.
