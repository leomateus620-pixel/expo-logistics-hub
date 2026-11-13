# Marcadores 3D de Gastronomia

O `CommercialMapCanvas` monta `GastronomyStructureMarkers` na cena externa, no lugar das etiquetas permanentes de Gastronomia. A camada cruza os UUIDs retornados por `foodPointsByStructure` com as estruturas renderizadas e consultáveis. O emblema preserva o tamanho nas aproximações e diminui progressivamente nas vistas médias e distantes. Os rótulos contextuais continuam identificando a estrutura selecionada. O marcador é decorativo e a ficha continua sendo o ponto de entrada para consultar ou selecionar pontos para venda.

A [textura frontal](../../../public/maps/gastronomy-marker.webp) foi criada no Creative Production e exportada em WebP RGBA de 256 × 256, com 12.860 bytes. A [referência em três quartos](emblema-tres-quartos.webp) orienta a espessura e o acabamento do aro modelado no Three.js.

## Conferência das coberturas

As coordenadas abaixo estão em unidades do mapa. Os pontos usam a geometria apresentada, com o centro e a rotação aplicados aos modelos arquitetônicos. Um raio vertical lançado sobre cada posição atingiu a cobertura esperada no canvas. A origem do feixe ficou cerca de 0,025 unidade acima da malha.

| Estrutura | Pontos | Âncora `[X, Y, Z]` | Referência visual |
| --- | ---: | --- | --- |
| C1 · Centro de Eventos Fenasoja | 1 | [20,668; 2,403; 7,250] | Cumeeira sobre o cruzamento do telhado do salão principal |
| C2 · Restaurante | 2 | [−18,602; 1,977; 7,691] | Cumeeira do salão na planta unificada de C2 e C3 |
| C4 · Churrascaria Exporural | 1 | [37,004; 1,352; −12,000] | Cumeeira do prédio principal |
| D1 · Alameda Gastronômica | 2 | [10,293; 1,560; 0,327] | Cumeeira da Alameda |
| D3 · Espaço Mirante | 5 | [15,011; 1,200; −7,876] | Centro da plataforma coberta reconstruída |
| D4 · Tenda da Pecuária | 1 | [−9,415; 1,247; −9,818] | Cumeeira da tenda |
| **Total** | **12** | **6 marcadores** | |

Na prévia, adicionar um ponto vendido em C2 levou o inventário a 13 pontos e manteve seis marcadores. Arquivar o último ponto de D4 deixou 11 pontos e cinco marcadores. A mistura de pontos disponíveis, em aberto e vendidos manteve os seis.

A prévia usa o canvas da aplicação, o inventário sintético do [roteiro de Gastronomia](../../commercial-map-gastronomia.md#validação-reproduzível) e o PostgreSQL local em `127.0.0.1:55438`.

Os 26 testes focados passaram. A suíte completa registrou 4.336 testes aprovados e as mesmas 93 falhas por nome na revisão e na base `b8589d14`.

## Capturas na prévia

| Vista | Desktop · 1440 × 920 | Celular · 390 × 844 |
| --- | --- | --- |
| Parque em vista geral | [Geral](desktop-visao-geral.webp) | [Geral](celular-visao-geral.webp) |
| Gastronomia | [Seis marcadores em foco](desktop-gastronomia.webp) | [Seis marcadores em foco](celular-gastronomia.webp) · [Aproximação](celular-gastronomia-aproximada.webp) |
| C2 · Restaurante | [Oblíqua](desktop-c2-obliqua.webp) · [Consulta](desktop-c2-consulta.webp) | [Consulta](celular-c2-aproximacao.webp) · [Expandido](celular-c2-expandido.webp) · [Recolhido](celular-c2-recolhido.webp) |
| D3 · Espaço Mirante | [Oblíqua](desktop-d3-obliqua.webp) · [Superior](desktop-d3-superior.webp) · [Órbita de 360°](desktop-orbita.mp4) | [Carrinho](celular-d3-carrinho.webp) |
| Iluminação e acessibilidade | [Noite](desktop-noturno.webp) · [Gráficos reduzidos](desktop-graficos-reduzidos.webp) | [Movimento reduzido](celular-movimento-reduzido.webp) |

[Aproximações de C1](desktop-c1-obliqua.webp), [C4](desktop-c4-obliqua.webp), [D1](desktop-d1-obliqua.webp) e [D4](desktop-d4-obliqua.webp).

A navegação foi exercitada com órbita, zoom e pinça. Cliques e toques sobre C2 e D3 abriram as fichas em consulta e em Vendas. O carrinho móvel recebeu um ponto de D3 após a seleção explícita e a ação **Adicionar à venda**. As verificações também alternaram o segmento, a camada que contém C2, C4 e D1, o interior de D3 e o retorno ao exterior.

## Renderização sob demanda

Em janelas de dois segundos no perfil MEDIUM, a camada disparou 27 solicitações de quadro no foco de Gastronomia. Foram zero na visão geral distante, com o canvas oculto, em aba simulada como oculta, fora do enquadramento e em gráficos ou movimento reduzidos. O canvas oculto apresentou zero quadros. O mapa base já renderizava efeitos próprios em repouso na visão geral, por isso as solicitações acima foram medidas na camada de Gastronomia.

Após três alternâncias entre Exporural e Gastronomia, o renderizador voltou às mesmas 1.174 geometrias e 117 texturas. A camada usou uma única textura WebP e três malhas instanciadas. O feixe testa a profundidade da cena e deixa o buffer de profundidade intacto. A órbita registrou D3 visível nas 30 amostras, com o centro do emblema oscilando entre Y 1,914 e 2,105. A vista superior preservou a face legível sobre o telhado.

## Comparação de desempenho

Chrome 157 headless com ANGLE/Metal em Apple M5, 1.440 × 920, DPR 1, perfil MEDIUM e o mesmo inventário de teste. Cada célula resume três percursos de arraste de 3,8 segundos na prévia, depois da hidratação. Os tempos abaixo são as medianas dos percentis por percurso.

| Vista | Draw calls p50 | Intervalo por quadro p50 / p95 | CPU de envio p50 / p95 |
| --- | ---: | ---: | ---: |
| Geral | 1.350 → 1.353 | 16,7 / 17,6 → 16,7 / 17,3 ms | 5,0 / 5,6 → 5,7 / 6,3 ms |
| Gastronomia | 1.234 → 1.237 | 16,7 / 17,5 → 16,7 / 17,2 ms | 4,9 / 5,6 → 5,6 / 6,0 ms |

Na escala final, as seis faces mediram cerca de 11 px na visão geral desktop e 10 px na geral móvel. No enquadramento automático de Gastronomia, mediram 14–15 px no desktop e cerca de 12 px no celular. Na aproximação intermediária móvel, as faces visíveis mediram 20–26 px.
