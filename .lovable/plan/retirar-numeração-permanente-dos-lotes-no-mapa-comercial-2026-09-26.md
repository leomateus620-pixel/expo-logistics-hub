# Retirar numeração permanente dos lotes no Mapa Comercial

## Resultado esperado
- O mapa externo abre limpo, sem as faixas brancas e números sobre todos os lotes mostrados nos anexos.
- Ao clicar ou tocar em um lote, somente ele apresenta sua identificação contextual; ao desfazer a seleção, a identificação desaparece. Lotes sem número continuam sem número inventado.
- A mesma regra vale para visualização normal, Modo Vendas e links públicos autorizados. Cores, cadeados/logos de vendidos, seleção e ficha do lote permanecem.

## Detalhes técnicos
- A camada `PublicLotNumbers` é montada incondicionalmente por `BatchedLots` no mapa externo e desenha o atlas de números independentemente do controlador contextual já existente. Desmontar essa camada permanente sem mudar geometria, dados comerciais ou interação dos polígonos.
- Reutilizar `EntityLabel` e `useContextualMapLabel` para a identificação do lote selecionado. Ajustar a regra visual dos links públicos que hoje oculta a legenda de seleção, garantindo que uma única identificação apareça após toque/clique sem encobrir o painel.
- Manter o comportamento contextual de hover onde já funciona, sem reintroduzir etiquetas permanentes; não modificar a planta interna de pavilhões, que usa outra textura de números.

## Conferência
- Comparar o mapa externo nas duas regiões dos anexos antes e depois, em desktop e mobile: nenhuma faixa numérica sem seleção, exatamente uma identificação ao selecionar, nenhuma após fechar/trocar a seleção.
- Verificar Modo Vendas e link público, incluindo lote vendido e lote sem número; confirmar que clique, arrasto, zoom, ficha e seleção múltipla seguem funcionando.
- Executar testes focais do mapa e verificar a compilação da prévia. Nenhuma alteração de banco ou publicação.
