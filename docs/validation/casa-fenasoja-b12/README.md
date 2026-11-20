# Casa FenaSoja B12 · modelo 3D e materiais do Higgsfield

O GLB original foi exportado da cena do Mapa Comercial com a malha, as UVs, 24 materiais e 15 texturas. Ele foi importado como geometria editável no 3D Jutsu. A revisão 13 do Higgsfield inclui telhas, cumeeira, beirais, marquise e caixilhos refinados e materiais recalibrados na fachada, entrada, jardim e monumento. Os mapas de cor e normal do reboco, cerâmica e concreto têm 1.024 × 1.024 pixels. Os mapas de rugosidade correspondentes têm 512 × 512. O GLB devolvido reúne 25 texturas mapeadas às superfícies.

A versão aplicada carrega o modelo e os mapas locais ao aproximar a câmera. A geometria existente é usada durante o carregamento, à distância e se um arquivo falhar. A B12 mantém o registro em metros, a mesma largura, profundidade e orientação para a Rua Brasília. O ponto mais alto da nova cobertura sobe cerca de 10 cm na maquete. A implantação vem da planta registrada e a vista aérea serviu para conferir as relações com as ruas e o edifício vizinho. [Registro cartográfico](../../fenasoja-complex-reconstruction.md)

| Ativo no maior detalhe | Malhas desenhadas | Triângulos | Texturas |
| --- | ---: | ---: | ---: |
| Fonte exportada do mapa | 36 | 170.069 | 15 |
| Revisão 13 do Higgsfield no mapa | 39 | 123.933 | 25 |

A luz direcional usa a direção, cor e intensidade definidas no projeto 3D. A profundidade das sombras é calculada na geometria da B12 em uma textura de 768 × 768. No mapa, a luz realça a fachada, os anexos, o passeio, os canteiros e o bronze. A contribuição diminui durante a chuva e a transição para a noite. A solução reaproveita a iluminação dinâmica do parque e o Canvas existente.

A entrega do modelo e da luz carrega cerca de 11,3 MB sob demanda. A compressão das malhas preserva as coordenadas e os atributos. As texturas WebP convertidas conservam os pixels da fonte.

## Comparações na cena do mapa

- [Fachada antes, 2208 × 1436](antes-fachada-2208x1436.webp)
- [Fachada depois, 2208 × 1436](depois-fachada-2208x1436.webp)
- [Vistas oblíqua, da cobertura, do jardim e à noite](comparativo-ambientes.webp)

As capturas de antes e depois foram feitas no WebGL com a mesma posição de câmera, campo de visão, enquadramento, resolução e caminho de renderização. Os arquivos frontais foram empacotados em WebP sem perdas e na resolução nativa.

## Circulação na sede

Zélia Savoldi e Cléo Rockenbach conversam diante da sede com gestos alternados. Roque Lugoch circula pelo passeio da Rua Brasília e Débora Bamberg percorre o acesso lateral. As duas rotas têm fases próprias e mantêm distância da porta, dos canteiros e do monumento. A passada usa o deslocamento ao longo da rota para sincronizar o apoio dos pés com o movimento. Na recepção, Fabiano Soltis e Djeison Drey aparecem sentados e um visitante caminha pelo corredor.

Os retratos institucionais serviram para observar feições, cores, cabelo, acessórios e vestuário. No 3D Jutsu foram modelados o rosto, as armações, o bigode de Cléo e os lenços de Zélia e Débora. A pele apresenta cor por vértice em geometria opaca. Cabelo, olhos, tecido e metal recebem materiais próprios e respondem à iluminação da B12 por todo o perímetro. [Comissão Central Fenasoja 2028](https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/)

A aproximação da câmera carrega apenas os personagens necessários. Movimento reduzido e aba oculta pausam a animação. Uma falha isolada no passeio usa um visitante de reserva quando disponível. Os originais genéricos foram produzidos com os ativos centrais do MakeHuman. [Licença CC0](https://www.makehumancommunity.org/about/license.html)

- [Comissão na fachada, 2208 × 1436](comissao-rota-desktop-visitantes-fachada.png)
- [Recepção em visita, 2208 × 1436](comissao-rota-desktop-visitantes-interior.png)

O [manifesto dos quatro GLBs](../../../public/models/commission/manifest.json) registra juntas, acessórios, hashes e os pixels das texturas compactadas em WebP sem perdas. Os quatro modelos do passeio somam cerca de 14 MB carregados sob demanda.

## Verificação

| Cobertura | Resultado |
| --- | ---: |
| Matriz WebGL em cinco perfis, com 35 recursos verificados por hash em cada perfil | 100/100 |
| Fluxo pela busca, seleção, visita e retorno em desktop | 31/31 |
| Mesmo fluxo em celular | 31/31 |
| Falha de cada GLB externo, com os demais personagens presentes | 31/31 por pessoa |
| Avatares sentados e preservação dos clips no Chrome | 16/16 por dispositivo |
| Testes focados do Mapa Comercial e do Soy Summit | 55/55 |

A matriz cobre fachada, entrada, laterais, jardim, cobertura, dia, noite e chuva. O fluxo inclui pausa por movimento reduzido, retomada, seleção direta, desmonte das camadas e visibilidade dos quatro personagens. A [verificação da Comissão](verificacao-comissao.json) contém os hashes usados pelo navegador e os resultados por caso.

A matriz pode ser executada no Vite com Playwright disponível e as variáveis `QA_URL`, `QA_LIGHTING=1` e `QA_B12_VISITORS=1`. O roteiro usa a [rota de diagnóstico 3D](../../../scripts/fenasoja-complex/asset-matrix.cjs). A suíte geral registrou as mesmas 87 falhas da base `main`, com dois novos testes de materiais faciais aprovados.
