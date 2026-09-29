# Corrigir os mapas comerciais das três comissões

## Resultado esperado
- O **Espaço do Automóvel**, a **Expo Rural** e **Indústria, Comércio e Serviços** abrem o mapa pelo menu existente, sem a tela “Segmento comercial indisponível”.
- O parque permanece visível com suas estruturas, vias e demais áreas em aparência normal, sem apagamento; a câmera abre focada na área da comissão.
- Só os lotes e preços da própria comissão são consultáveis e selecionáveis. Os lotes dos outros segmentos aparecem como contexto, mas não podem abrir ficha, entrar no carrinho ou ser alterados. Isso vale tanto para o mapa normal quanto para o modo visita.

## Correção
1. Diagnosticar a falha de abertura no fluxo autenticado do Automóvel, identificando qual consulta ou validação falha e registrando um erro seguro e distinguível para facilitar a verificação. Corrigir a causa específica sem liberar o mapa administrativo completo como saída de emergência.
2. Reutilizar a consulta segmentada e o contexto cartográfico já existentes. Disponibilizar o contexto seguro do parque também no mapa normal, além do modo visita; manter inventário, preços, compradores e operações de outros segmentos fora da resposta da comissão. Preservar o foco inicial na área autorizada e a aparência regular das estruturas e áreas de contexto, sem filtros de opacidade aplicados apenas por estar na comissão.
3. Aplicar a restrição de clique, toque, busca, ficha, interior, lista e demais entradas às entidades autorizadas; manter o mapa das comissões somente de leitura. Usar a fonte atual de preços do mapa comercial para os lotes do segmento, sem duplicar valores.
4. Testar as três comissões, incluindo abertura, atualização, geometria e inventário, preços, foco, mapa completo visível, modo visita e impossibilidade de selecionar outra área. Verificar desktop e celular; nenhum dado comercial externo deve aparecer na resposta da comissão.

## Cuidados técnicos
- Os registros das três áreas estão ativos. A consulta ao banco encontrou 56 entidades/52 lotes no Automóvel, 115/101 na Expo Rural e 1.192/1.168 em Indústria; as entidades têm geometria vigente. A tela de erro é exibida sempre que a consulta da comissão não entrega dados, portanto a imagem isolada não identifica qual requisição falhou.
- Hoje o restante do parque só é mesclado à cena durante o modo visita; no mapa normal a cena recebe apenas as entidades da comissão. A restrição de interação já existe para o contexto do modo visita e deve ser estendida ao modo normal. Diferenciar foco de câmera de filtro visual para não desbotar o parque.
- Preservar registros, geometrias, permissões, vendas, links e rotas existentes; alterar regras de acesso somente se a investigação demonstrar necessidade, sem expor dados de outras comissões. Não publicar sem pedido explícito.
