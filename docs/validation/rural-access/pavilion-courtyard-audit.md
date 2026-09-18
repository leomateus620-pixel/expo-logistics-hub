# Pavilhões 1, 14 e 12 — caminho e pátio

A fotografia aérea `IMG_0967.jpeg` mostra a ligação pavimentada entre os Pavilhões 1 e 14 e o pátio entre os Pavilhões 14 e 12 com copa central. `IMG_0971.jpeg`, `IMG_0972.jpeg` e `IMG_0973.jpeg` mostram as lacunas de pavimento na implementação anterior. As larguras e a escala da árvore são estimativas registradas nos footprints existentes, sem medição topográfica.

| Âncora canônica | Identificador | Limites na referência PDF |
|---|---|---|
| Pavilhão 1 | B1 | 2298, 3600 → 2655, 3759 |
| Pavilhão 14 | B2 | 2418, 3833 → 2658, 4074 |
| Pavilhão 12 | B3 | 2792, 3827 → 3147, 4089 |
| Ambulatório | B23 | 2670, 3970 → 2780, 4140 |

O caminho existente termina em `[2398,3796]`. A continuação reutiliza seus dois vértices de fechamento, atravessa o espaço livre B1/B2 e alcança um único polígono de concreto no pátio B2/B3. O pátio mantém uma abertura real para a raiz e uma árvore visual central na parte livre, em `[2725,3901.5]`, derivada dos limites B2/B3/B23.

**Limite documental:** B23 ocupa parte sul do intervalo B2/B3 e está marcado `NEEDS_REVIEW` no cadastro. A foto não autoriza eliminar esse serviço. O concreto é recortado pelo footprint B23 e nenhuma estrutura, ID, permissão ou área comercial é alterada. A copa não é apresentada como espécie ou árvore oficial inventariada.

A união de polígonos remove sobreposição entre os dois trechos novos. Todos os footprints de vias e as quatro âncoras são subtraídos; o caminho antigo permanece com sua superfície original até a junta, sem concreto por cima. As superfícies ambientais substituídas são recortadas com diferença poligonal, inclusive quando o recorte alcança uma borda. A árvore usa o lote de instâncias existente.

Validação focada: continuidade de uma única superfície; compartilhamento da junta do caminho; área de sobreposição zero com vias, B1/B2/B3/B23 e pisos ambientais; abertura da raiz; uma árvore em ambas as qualidades; concreto abaixo de 60 triângulos. O renderer ambiental continua com quatro draw calls e zero passes de sombra. Isso é contagem estática; medições da cena e capturas visuais são responsabilidade da validação integrada.
