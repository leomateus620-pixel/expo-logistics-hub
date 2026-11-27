# Por dentro da marca Fenasoja

No portal, toque na marca **Fenasoja 2028 · Ver filme**. O sol e os sulcos do símbolo deixam ver o parque de Santa Rosa. A câmera entra, encontra o cartaz verde de 1966 e volta ao mesmo sobrevoo depois das 25 edições. O controle **Abrir ecossistema** continua ao alcance de um toque.

| Formato | Primeiros 3,5 segundos | Percurso completo, com entrada e saída | Comparação do aéreo |
| --- | --- | --- | --- |
| Notebook, 1366 × 768 | [Reproduzir abertura](previas/paisagem-abertura.mp4) | [Reproduzir gravação](previas/paisagem-completo.mp4) | [Ver os dois quadros](reencontro-paisagem.webp) |
| Celular emulado, 390 × 844 | [Reproduzir abertura](previas/retrato-abertura.mp4) | [Reproduzir gravação](previas/retrato-completo.mp4) | [Ver os dois quadros](reencontro-retrato.webp) |

Os MP4 registram a rota real em velocidade normal e sem som. A sequência dura 14 segundos, com um pequeno intervalo de portal antes e depois nas gravações completas. A versão de movimento reduzido dura 4,2 segundos e mostra três composições estáveis. [Prancha de avaliação nos dois formatos](prancha.webp) · [Sobreposição da marca antes e depois](registro-da-marca.webp)

## Direção e montagem

O vídeo indicado por Leonardo, publicado por Spaces, oferece um fluxo de 3840 × 2160 a 30 fps. Conferimos os quadros publicados pelo YouTube a intervalos de um segundo com o trecho filmado no monitor. Por volta de 2 s a ave ocupa o centro. Entre 4 e 8 s, folhagem, arcos e uma curva rosa em primeiro plano encobrem partes de uma composição e revelam a seguinte. A partir de cerca de 11 s, o mural recua e sobra uma marca pequena sobre fundo escuro. A montagem da Fenasoja aplica essa mudança de escala a objetos do seu acervo. [Abertura de referência](https://www.youtube.com/watch?v=OEuYdv4-yqI)

| Tempo de projeção | Documento e movimento dominante |
| --- | --- |
| 0–0,8 s | O primeiro fragmento local aparece sobre a imagem da marca medida no cabeçalho. O filete acompanha o arco superior do sol. A fotografia abre com velocidade diferente da expansão da máscara. |
| 0,8–1,79 s | O beiral da cobertura de 2026 encontra a borda do **próprio cartaz de 1966**. A folha toma a tela, muda de escala e pousa ao lado de Willy Klaus. Ano e datas estão fora da arte. |
| 1,79–3,5 s | O rosto e a data ficam imóveis. Aos 2,76 s a borda de papel começa a descobrir a parede. O primeiro painel da galeria ocupa o quadro aos 3,5 s. |
| 3,5–9,76 s | Os impressos avançam em ordem, com um segundo retrato documentado, Eugênio Pilz. A folha anterior abre espaço para a mão da extensionista na Exporural de 2018. As últimas campanhas dividem o papel com o plantio coletivo de 2025. |
| 9,76–11,55 s | A rua junto ao pórtico da Exporural ganha profundidade. O galho e a placa em primeiro plano foram recortados da foto da rua. A câmera do fundo se desloca menos. |
| 11,55–14 s | O mesmo recorte do aéreo permanece aberto. A máscara volta à posição atual do cabeçalho e os últimos quadros mostram a imagem do próprio DOM. |

O papel creme com tinta verde foi gerado para esta produção com ImageGen. Usamos a vagem do cartaz para o detalhe ampliado no fundo da origem. A trama acrescentada na travessia é uma intervenção gráfica presa à folha. A medição de três trechos claros da digitalização do selo de 1966 indicou repetição em torno de 3,3–3,5 px e orientação de 11–13° no arquivo de 1000 px. Essa observação orientou a escala da trama. Os retratos, as campanhas, os visitantes e a implantação do parque vêm das fontes documentais. [Quatro referências anotadas](referencias.webp) · [Selo na coleção ACISAP](https://90anos.acisap.org.br/gestores/Willy-Klaus)

A seleção começou com dois pares de aéreo e impresso. A cobertura no par B preserva a rua ao passar para retrato. Seu beiral sobe 18,4° para a direita e cruza o original em (1920, 1000). A origem, o mural humano e a rua têm composições verticais próprias. A palma da mão e o rosto da extensionista permanecem no campo de visão. [Duas provas de encaixe com coordenadas](pares/README.md)

## Acervo, créditos e arquivos

As 25 edições estão representadas. Doze peças individuais já faziam parte do catálogo. Treze cartazes adicionais foram recuperados do mosaico da revista. Os arquivos individuais em alta definição desses treze continuam pendentes, assim como o programa original da estreia. O registro de cada edição distingue a peça gráfica, o suporte, a resolução e as condições conhecidas de uso. O botão **Créditos** abre a ficha pública durante a reprodução. Os originais publicados pelas assessorias não trazem uma licença audiovisual aberta. A organização pode conferir os termos contratados para a exibição institucional antes da publicação em produção. [Inventário das 25 edições](acervo.md) · [Fotografias, autoria e pesquisa ampliada](fotografias.md) · [Ficha pública](../../public/portal/brand-film/creditos.html)

Os [originais e recortes documentais](fontes) estão separados das [artes finais de projeção](../../public/portal/brand-film). A montagem de papel, retratos, tipografia e recortes pode ser refeita com Pillow e as fontes indicadas no [preparo das artes](../../scripts/brand-film/plates.py). Os tempos e movimentos estão na [projeção](../../src/components/portal/brand-film/projection.ts).

## Verificação no portal

A revisão usou o navegador integrado e gravações Chromium do build de produção com os dois viewports acima. O celular teve toque emulado. As medições de transferência usaram contexto novo, cache frio e service worker bloqueado para medir os bytes da rede. Nenhum WebP do diretório de projeção foi solicitado antes do clique. O lampejo de 2,8 kB acompanha o código do portal. Em aparelhos com até quatro núcleos lógicos ou economia de dados, a projeção reduz a densidade e dispensa a trama e o recorte secundário da rua.

| Formato | Transferência ao abrir, incluindo JS de projeção | Primeiro quadro decodificado após o clique | Intervalo entre quadros, p95 |
| --- | ---: | ---: | ---: |
| Paisagem | 1.551.121 bytes | 115 ms | 18 ms |
| Retrato | 1.217.981 bytes | 98 ms | 18 ms |

O roteiro exerceu abertura por teclado, toque repetido, Pular, Esc, foco restaurado, reabertura, som optativo, rotação, movimento reduzido, imagem interrompida, atraso na transferência e saída quando a marca sai de vista. Verificou o acesso à Alvorada, ao Ecossistema logo após o filme, ao Memorial e ao link direto do mapa. A medição de fluidez representa o computador de teste. A validação de percepção com um visitante e a reprodução em celular físico permanecem em aberto. [Roteiro executável](../../scripts/brand-film/capture.cjs) · [Medições por recurso](medicoes.json)

Na primeira montagem, o corte diagonal descobria a cena histórica inteira. A revisão substituiu esse corte pela folha física que atravessa a câmera. O segundo ajuste escureceu a interface durante a expansão, conservou o header imóvel e devolveu o último quadro ao DOM. A prancha coloca cada enquadramento junto ao documento que lhe dá origem. [Quadros exportados](quadros) · [Prancha final](prancha.webp)
