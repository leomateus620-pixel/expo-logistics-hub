# Remover linhas traçadas da orientação do Mapa Comercial

## Resultado esperado
- Retirar as linhas que aparecem e se movimentam sobre lotes, quadras e segmentos nos mapas externos, inclusive nos acessos de comissão e links públicos que reutilizam essa camada.
- Manter as etiquetas das quadras, os nomes das ruas, a identificação compacta dos segmentos e toda a interação e coloração comercial dos lotes.

## Alterações previstas
1. Remover somente os caminhos SVG de contorno de quadras da camada de orientação territorial e a rotina que reprojeta esses caminhos quando a câmera se move. Manter o cálculo de posições que sustenta as etiquetas.
2. Excluir os estilos exclusivos dessas linhas; conservar os estilos das etiquetas. Ajustar a frase da legenda que hoje promete “Limites no mapa”, sem mudar os filtros e o foco dos segmentos.
3. Verificar que os três segmentos permanecem identificáveis por texto e símbolo, sem linhas sobre os lotes, e que a navegação, seleção, ruas e quadras não mudam de comportamento.

## Detalhes técnicos e validação
- Os traços vistos nas imagens correspondem aos elementos `path` da camada `TerritorialOrientation`: ela desenha os anéis cadastrais de cada quadra e os reprojeta a cada mudança de câmera; as etiquetas são elementos separados e não dependem desses caminhos.
- Não alterar geometrias persistidas, o desenho comercial dos lotes, as quatro cores de situação, nem o minimapa do dashboard.
- Executar os testes focais de orientação/segmentos e conferir a prévia em desktop e celular, com movimento de câmera quando o ambiente permitir. Não publicar.
