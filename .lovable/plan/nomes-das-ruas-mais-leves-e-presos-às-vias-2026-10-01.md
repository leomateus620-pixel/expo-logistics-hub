# Nomes das ruas mais leves e presos às vias

## Resultado esperado
- Manter as etiquetas das quadras e dos segmentos como estão; alterar apenas a apresentação dos nomes das ruas na orientação do mapa.
- Exibir os nomes em fonte menor, leve e com contraste discreto sobre o piso da rua, sem o retângulo branco. O texto permanece horizontal e legível ao girar a câmera; sua posição acompanha a rua, sem animações ou deslocamentos arbitrários.
- Quando a rua não tiver largura ou trecho livre suficiente, omitir o nome naquele enquadramento, em vez de invadir lotes, edificações ou outras etiquetas.

## Implementação técnica
1. Na preparação da orientação territorial, usar a geometria das vias efetivamente apresentadas na cena para escolher uma âncora estável e um trecho adequado; respeitar recortes, vazios e nomes oficiais existentes. Conservar o escopo autorizado nos mapas de comissão e links públicos.
2. Na projeção em tela, medir o nome e verificar espaço livre sobre a superfície projetada da própria via, incluindo margem para as letras. Evitar obstáculos de interface, seleção, lotes e estruturas. Não aplicar rotação ao texto; se a projeção não permitir acomodá-lo integralmente na via, ocultá-lo. Preservar a atualização sob demanda e a estabilidade ao navegar.
3. Aplicar estilo exclusivo de rua, com tipografia menor e peso mais leve, cor semântica de contraste e halo sutil para leitura nos modos claro/noturno. Não alterar a aparência das quadras, contornos ou cores comerciais.
4. Acrescentar testes de âncora válida, contenção do texto, vias estreitas/irregulares, colisões e estabilidade. Conferir visualmente visão geral e aproximada, inclinação, rotação e tamanhos desktop/celular; registrar limitações se a prévia autenticada não estiver acessível. Não publicar sem pedido explícito.
