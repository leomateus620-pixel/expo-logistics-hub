# Acervo de campanha do cabeçalho FENASOJA

O pacote entregue pelo usuário é a fonte canônica das quatro artes de campanha. Foram preservados todos os bytes dos WebPs dimensionados fornecidos, incluindo seu enquadramento integral por contain e a transparência. Não houve redesenho, remoção de lettering ou nova compressão. O símbolo, wordmark e badge atuais continuam em `FenasojaBrand`.

## Catálogo e fontes

O manifesto original está em `source/artes-manifest.json`. As fontes abaixo reproduzem sua proveniência; esta implementação inspecionou os arquivos locais e não realizou uma nova auditoria dos sites externos.

| Campanha | Proveniência registrada no pacote | Consulta local |
| --- | --- | --- |
| 2014 | Publicidade integral, página 36 de [A Granja, fevereiro de 2014 / acervo Zebu](https://zebu.org.br/PortalUploads/Revistas/A_Granja/2014_Fevereiro/revista.pdf) | Master JPEG, extração PNG original e moldura SVG autocontida |
| 2016 | Publicidade integral, página 55 de [A Lavoura, edição 713 de 2016 / acervo Zebu](https://zebu.org.br/PortalUploads/Revistas/A_Lavoura/2016_Edi%C3%A7%C3%A3o%20713/revista.pdf) | Master JPEG, extração PNG original e moldura SVG autocontida |
| 2018 | [Portfólio GH Branding / Jacson Silveira e equipe](https://www.behance.net/gallery/58535353/Fenasoja) | Master WebP e moldura SVG autocontida |
| 2024 | [Reprodução de campanha, Sucesso no Campo](https://sucessonocampo.com.br/evento/fenasoja-2024/), conferida no pacote com [banner oficial](https://ftp.fenasoja.com.br/img/banner-fenasoja-24.jpg) | Master JPEG e moldura SVG autocontida |

As datas impressas nas imagens são históricas. A peça de 2016 contém o personagem da publicidade original. A interface não acrescenta créditos, slogans, datas sobrepostas ou uma arte institucional inventada para 2028; os nomes acessíveis identificam cada campanha.

## Exportação e integridade

As variantes de produção são exclusivamente os oito arquivos em `public/portal/history/`. SVGs e masters ficam em `docs/portal-history/source/`, fora do diretório servido pelo Vite e sem importação no catálogo de produção.

O conjunto pode ser preparado novamente de maneira determinística a partir do ZIP original, sem encoder, downloads ou dependências novas:

```sh
python3 scripts/portal-history/prepare.py --archive /caminho/Fenasoja_Portal_Artes.zip
python3 scripts/portal-history/prepare.py
```

O primeiro comando restaura os exports WebP já convertidos no pacote, byte a byte. A segunda execução só verifica. O script confere o SHA-256 do ZIP, hashes e tamanhos dos 19 arquivos preservados, dimensões dos oito WebPs e ausência de arquivos extras no diretório público. Re-encodar os masters com outra versão de codec pode produzir bytes diferentes e não faz parte desta preparação.

SHA-256 do ZIP original: `3ed08a1baec47758f6738d8e586b1a9c799b48ca69d7dca4494b7b079ea56d80`.

Os masters têm dimensões 1252 × 866 (2014), 823 × 1094 (2016), 1296 × 632 (2018) e 526 × 526 (2024). Na variante de 640 × 480, a arte ocupa respectivamente 640 × 443, 361 × 480, 640 × 312 e 480 × 480 dentro do canvas transparente. Todas são reduções; não há upscale dos pixels da arte. O catálogo fornece `srcset` de 320w e 640w para o navegador escolher conforme o slot e a densidade.

## Tamanhos medidos

Tamanhos reais em bytes, verificados nos arquivos exportados e por SHA-256:

| Campanha | 320 × 240 | 640 × 480 |
| --- | ---: | ---: |
| 2014 | 19.028 | 62.444 |
| 2016 | 14.090 | 44.278 |
| 2018 | 9.728 | 23.518 |
| 2024 | 7.272 | 17.320 |
| Desktop, quatro artes | **50.118** | **147.560** |
| Mobile, 2016 + 2024 | **21.362** | **61.598** |

O pior caso medido por conjunto, escolhendo a variante de 640 × 480 para todas as artes, é 147,56 KB no desktop e 61,60 KB no mobile (KB decimal). Os conjuntos ficam abaixo das metas iniciais de 350 KB e 200 KB. Os totais representam uma variante por campanha: o browser não precisa carregar ambas. O catálogo não decodifica nem carrega masters; o componente visual prepara somente o conjunto escolhido pela largura real do card.

Verificação realizada: `python3 scripts/portal-history/prepare.py --archive …` e nova execução de `python3 scripts/portal-history/prepare.py` confirmaram todos os 19 arquivos. `portalHistoryAssets.test.ts` também protege os bytes canônicos, a transparência das molduras, as variantes locais e a seleção 2016/2024.
