# Amanhecer no Parque de Exposições

No Mapa Comercial, selecione a Casa FenaSoja e abra **Assistir ao filme**. A opção também aparece dentro da sede no Modo Visita. O vídeo tem som estéreo e legendas descritivas em português. A câmera do visitante conserva a posição ao fechar o filme.

## O parque no filme

A tomada inicial e o contraplano do embarque usam a cena tridimensional do Mapa Comercial. A Casa ocupa a esquina da B12 com o Palco Cultural Lactalis imediatamente ao lado. O parque permanece visível durante a subida. A Arena Sicredi/Icatu tem uma cobertura branca arqueada. Atrás aparecem o terreno aberto, as vias e a faixa de árvores observados na vista aérea de 19/03/2026. O Google Earth foi consultado em 20/11/2026. A reconstrução usa o modelo do projeto e quadros autorais. [Vista consultada no Google Earth](https://earth.google.com/web/@-27.84434498,-54.48053238,317.53919463a,1050d,35y,0h,0t,0r)

No plano da fachada, a composição foi restrita às árvores que ficam atrás da Casa e do palco. O contorno da cobertura, o letreiro da Casa, o asfalto e os postes orientam a comparação. A revisão dá volume ao colo dos troncos, individualiza as bifurcações e deixa ver a luz nas clareiras. Os lotes aparecem em verde na representação cinematográfica. Nos dois percursos do mapa, 51 árvores receberam madeira e bifurcações variadas nas posições cadastradas. O plano fotográfico usa uma placa de vegetação registrada e máscaras de oclusão para preservar a aeronave, o cabo e os passageiros.

![Comparação do bosque durante a subida](bosque-atrás-da-casa.webp)

## Pessoas, som e encerramento

O filme encena um embarque fictício. Cléo Antonio Rockenbach, Zélia Savoldi e Roque Vanderlei Lugoch sobem primeiro. O presidente Fabiano Soltis e o vice-presidente Djeison Drey embarcam em seguida. Os retratos do projeto orientaram as interpretações. A foto fornecida por Leonardo Strochein orientou o plano do piloto. O emblema na aeronave é o da FenaSoja. [Comissão Central anunciada pela FenaSoja](https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/)

O rotor ganha presença na aproximação, permanece audível durante o embarque e perde volume à medida que a aeronave se afasta. A mixagem utiliza duas gravações reais com licença CC0 e uma ambiência de parque criada para o filme. [Créditos e fontes de áudio](../../../scripts/filme-fenasoja-2028/CREDITOS-AUDIO.txt)

No céu azul, o emblema aparece através da névoa. As letras de **FENASOJA** têm faces e chanfros azuis. O ano **2028** recebe reflexos dourados. Os contornos do letreiro vêm dos arquivos tipográficos da experiência Alvorada. [Atribuições tipográficas](../../../public/alvorada/ATTRIBUTION.md)

Nos seis segundos finais, o player monta o mesmo relógio oficial do portal e continua atualizando os valores após o último quadro. A abertura configurada é **29 de abril de 2028 às 10h, horário de Brasília**. Ao retroceder, o relógio acompanha a posição do filme. O botão **Baixar em Full HD** salva o filme completo com uma contagem datada no próprio vídeo. A referência desta exportação é 20/11/2026 às 04h44 em Brasília. O primeiro valor mostrado é 526 dias, 5 horas, 15 minutos e 59 segundos. A contagem em tempo real funciona dentro do mapa. [Configuração oficial](../../../src/config/fenasoja-2028.ts)

## Montagem

Os tempos, os recortes de câmera e as legendas estão na [lista de planos](../../../scripts/filme-fenasoja-2028/montagem.json). Os dois cortes têm 50 segundos e 1.200 quadros a 24 fps. A distribuição usa MP4 H.264 com índice no início do arquivo, som AAC estéreo a 48 kHz e poster WebP. O arquivo para o mapa tem 1280 × 720. O download tem 1920 × 1080 e incorpora uma faixa de legendas selecionável. Os voos do mapa e o letreiro foram renderizados para as duas resoluções. O retrato da diretoria usa a imagem original de alta resolução. As tomadas cinematográficas Higgsfield em 720p recebem reamostragem para o master Full HD. O mapa solicita os arquivos de mídia ao abrir o player.

A equipe de edição pode refazer a montagem com as tomadas locais listadas no manifesto. É necessário disponibilizar FFmpeg e Node no PATH, instalar as dependências do projeto e usar Python com NumPy, SciPy e opencv-python. Para o download, o executor TypeScript tsx e os arquivos Hind do próprio projeto permitem renderizar os seis segundos do relógio a partir da implementação oficial. O processo renderiza os contornos tridimensionais, sincroniza o som e gera as legendas.

```sh
node scripts/filme-fenasoja-2028/parque/render.cjs --out ./tomadas
node scripts/filme-fenasoja-2028/parque/render.cjs --full-hd --out ./tomadas-hd
python3 scripts/filme-fenasoja-2028/montar.py ./tomadas
python3 scripts/filme-fenasoja-2028/montar.py ./tomadas --full-hd-shots ./tomadas-hd --clock-reference '2026-11-20T04:44:01-03:00'
```
