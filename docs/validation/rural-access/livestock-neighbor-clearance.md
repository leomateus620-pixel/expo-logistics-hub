# D4 — implantação e limite com B28

A inspeção visual intermediária revelou interpenetração entre o telhado de D4 e o Espaço do Cooperativismo B28. O envelope anterior da PR era `[2840,2459] → [3010,2591]`; B28 começa em `x=3000`, formando sobreposição cadastral de `10×90` unidades da referência. O telhado, com 97,5% do comprimento, ainda atingia `x=3007,875`.

A fachada voltada à rua permanece ancorada na borda `x=2840`. O fundo agora deriva da borda oeste canônica de B28 menos três unidades de referência: `x=2997`. O novo centro `[2918,5;2525]` e comprimento `157` resultam dessas duas bordas, preservando orientação e largura transversal `132`. O deslocamento do centro é consequência do recorte de fundo; não é uma translação arbitrária da construção. B28 passa a compartilhar a mesma constante de origem sem mudar seus limites, identidade ou geometria.

Os testes conferem o limite frontal, a derivação do recuo, a preservação exata de B28 e todos os vértices das três geometrias mescladas — incluindo telhado, empenas e detalhe máximo — após aplicação do yaw real e translação. Nenhum vértice alcança a borda de B28. O recuo é uma restrição visual de não interpenetração, não uma distância de segurança ou medida as-built.

Também foi corrigido o descarte das instâncias de árvores e sub-bosque em `ParkAccessEnvironmentLayer`: trocas de qualidade liberam o objeto anterior via callback de referência, mantendo geometrias, materiais e texturas com seus proprietários separados.
