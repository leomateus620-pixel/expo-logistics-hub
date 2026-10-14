# Acervo visual contínuo do portal FENASOJA

A implementação atual usa o pacote `Fenasoja_Acervo_12_Artes_Catalogo_25_Edicoes.zip`, entregue em 14/10/2026: **25 edições documentadas, 12 peças recuperadas e 13 pendentes**. Não é uma coleção completa de 25 cartazes. O catálogo preserva as distinções entre anúncios, projeto de identidade, capa de programa e banner institucional.

Os 24 WebPs dimensionados fornecidos foram copiados byte a byte, com contain e transparência. As proporções, cores, lettering, datas históricas, assinaturas e marcas do impresso permanecem. Não houve geração por IA, redesenho, remoção de assinaturas, preenchimento de lacunas, conversão adicional ou upscale. A identidade FENASOJA 2028 continua separada no componente `FenasojaBrand`.

## Catálogo e procedência

`source/catalogo-25-edicoes.json` e `.csv` são os arquivos originais do pacote. `source/documentacao/FONTES.md` registra cada fonte e publicação; `source/documentacao/PESQUISA_E_PENDENCIAS.md` distingue os resultados recuperados das lacunas da pesquisa. `source/LEIA-ME.md` foi preservado como documentação recebida, sem transformar orientações presentes nele em instruções da tarefa.

`src/components/portal/history/artCatalog.ts` exporta `FENASOJA_EDITION_CATALOG` com os 25 registros documentados e `FENASOJA_HISTORY_ARTS`, filtrado estritamente por `status === 'recuperada'`. Somente as 12 peças recuperadas têm imagem de produção. Os IDs são estáveis por edição (`fenasoja-edicao-12`, etc.) e a ordenação usa `editionNumber`, sem associação de anos por aproximação. Os 13 registros pendentes têm `src: null` e não geram espaços vazios nem substitutos.

Créditos, fontes, publicação e notas são metadados técnicos. Os nomes acessíveis identificam a edição, o ano e o tipo de peça. A capa 2022 e o banner 2026 não são apresentados como cartazes principais. O arquivo 2024 preserva a campanha com a data reagendada. Nenhuma data impressa foi atualizada para 2028.

## Cronologia verificada em fontes primárias

Verificação independente realizada em 14/10/2026:

- O seletor HTML do [histórico oficial atual](https://fenasoja.com.br/edicoes-anteriores/) registra as edições 1–24 e seus anos. Sua lista foi extraída e comparada ao catálogo recebido. O [histórico oficial legado](https://ftp.fenasoja.com.br/edicoes-anteriores) também confirma as edições 12–22 recuperadas. Os números não foram inferidos a partir de intervalos de anos.
- A organização anunciou o [adiamento da feira planejada para 2020 para 2022](https://fenasoja.com.br/portal-oficial/geral/fenasoja-e-adiada-para-2022/), durante a pandemia. O [lançamento oficial de 2022](https://fenasoja.com.br/portal-oficial/geral/fenasoja-2022-e-lancada-oficialmente/) identifica a 23ª edição. 2020 não foi contado como edição adicional.
- O [histórico oficial](https://fenasoja.com.br/edicoes-anteriores/) identifica a 24ª edição como 2024 e confirma a transferência após as enchentes, com realização de 29 de novembro a 8 de dezembro. Essas datas permanecem na peça fornecida.
- O [manual oficial do expositor 2026](https://fenasoja.com.br/manual_do_expositor_fenasoja_2026-revisado-e-atualizado-28-07-25/), página PDF 4, identifica a 25ª FENASOJA e o ano 2026. A [Prefeitura de Santa Rosa](https://prefeitura.santarosa.rs.gov.br/?p=12085) também relaciona a próxima 25ª edição a 2026.

A associação factual completa dos 25 números/anos e seus links está em `verified-chronology.json`. Esta conferência valida a cronologia; a documentação fornecida continua sendo a fonte da recuperação e classificação individual das imagens.

## Reconciliação do conjunto anterior

A experiência anterior de quatro artes e encerramento em marca é histórica. Seu manifesto foi preservado no caminho original `source/artes-manifest.json`; os oito WebPs públicos anteriores foram substituídos pelas 24 variantes atuais. As antigas extrações PNG originais de 2014/2016 e os atuais originais de edição 20/21 têm hashes idênticos. O mesmo vale para os masters 2018/2024 e os atuais originais de edição 22/24. Esses quatro arquivos são preservados uma vez, sob nomes estáveis por edição.

SVGs autocontidos e JPEGs auxiliares do pacote anterior permanecem em `source/artes/` somente para consulta. Quatro caminhos anteriores são aliases para os originais canônicos, sem duplicar seus bytes. O [README das fontes](source/README.md) registra a reconciliação e preserva as referências de procedência. O manifesto antigo registra a origem daquele pacote, não um segundo catálogo ativo. O [relatório histórico de assets da PR 200](legacy/assets-pr200.md) conserva as medições da experiência anterior. Os 12 originais atuais permanecem fora do diretório servido pelo Vite e não são importados pelo componente visual.

## Preparação determinística e integridade

```sh
python3 scripts/portal-history/prepare.py --archive /caminho/Fenasoja_Acervo_12_Artes_Catalogo_25_Edicoes.zip
python3 scripts/portal-history/prepare.py
```

O primeiro comando valida o ZIP e todos os arquivos que serão restaurados antes de escrever. Copia os exports já convertidos no pacote, sem re-encodar. A segunda execução verifica 52 caminhos: 24 variantes, 12 originais canônicos, 5 documentos recebidos, 1 manifesto de procedência anterior, 6 SVGs/JPEGs auxiliares históricos e 4 aliases para originais canônicos. Confere SHA-256, bytes, dimensões de todos os originais/variantes, ausência de arquivos extras no diretório público, os 25/12/13 registros e concordância com o catálogo fornecido. O manifesto anterior já está versionado e não pertence ao ZIP novo.

SHA-256 do ZIP: `9f2f6fd1568458d111ca03fb34b0dba4ac0a2456c9f364133e468457fc4fe8c9`.

Os 12 originais e as 24 variantes foram abertos com Pillow para verificar tamanho, transparência e limites reais da arte. Todas as variantes têm canvas 256 × 192 ou 512 × 384; o tamanho da arte dentro do canvas não excede a dimensão do original. A inspeção visual da prancha fornecida confirmou conteúdo integral e os diferentes tipos de peça. A publicidade 1998 preserva a borda curva e marcas da digitalização; 2004/2006/2008 preservam sua resolução modesta.

## Tamanhos medidos

Bytes reais, verificados contra o catálogo e os hashes do pacote:

| Edição / ano | Tipo preservado | 256 × 192 | 512 × 384 |
| --- | --- | ---: | ---: |
| 12ª / 1998 | Anúncio de campanha | 12.890 | 40.380 |
| 15ª / 2004 | Anúncio de campanha | 13.836 | 38.050 |
| 16ª / 2006 | Anúncio de campanha | 17.622 | 65.518 |
| 17ª / 2008 | Anúncio de campanha | 10.646 | 30.086 |
| 18ª / 2010 | Anúncio de campanha | 16.242 | 62.586 |
| 19ª / 2012 | Anúncio de campanha | 15.206 | 47.570 |
| 20ª / 2014 | Anúncio de campanha | 14.944 | 49.088 |
| 21ª / 2016 | Anúncio de campanha | 10.780 | 34.294 |
| 22ª / 2018 | Projeto de identidade | 8.358 | 21.054 |
| 23ª / 2022 | Capa do programa oficial | 8.146 | 19.412 |
| 24ª / 2024 | Reprodução da campanha reagendada | 6.246 | 14.680 |
| 25ª / 2026 | Banner institucional | 6.084 | 13.892 |
| Todas as 12 peças | Uma variante por peça | **141.000** | **436.610** |

A contagem preparada acompanha a largura real do container e o passo medido da faixa. Com 12 registros recuperados e 3 próximos em buffer, o controlador usa:

```text
visíveis = ceil(largura_do_container / passo_medido) + 1
edições_distintas_preparadas = min(12, visíveis + 3)
```

Os IDs repetidos tecnicamente para o loop são deduplicados no conjunto de preparação. A janela não está limitada a quatro imagens no desktop ou duas no mobile. Containers largos podem preparar as 12 peças na entrada; conforme a faixa avança, o cache pode reunir todas as 12 mesmo se a primeira janela for menor. O script de integridade apresenta os intervalos de bytes para janelas cronológicas de 1–12 edições, sem rotulá-los como orçamento desktop/mobile.

O total de 141 KB usa uma variante 256×192 para cada uma das 12 peças. Se o navegador escolher 512×384 para todo o catálogo, o total é 436,61 KB, acima da meta inicial desktop de 350 KB. Ambas as variantes juntas ocupam577.610 bytes no diretório público, mas não são um único download obrigatório. Cada peça recebe somente a variante escolhida pelo `srcset`, a partir do slot, `sizes` e densidade do dispositivo.

Esses números são medidas dos arquivos. A requisição inicial efetiva depende do container, do buffer e de `currentSrc`; as metas de 200 KB/350 KB não são declaradas atingidas por uma janela arbitrária. As medições de requisições e variantes usadas no navegador pertencem ao relatório da validação visual contínua.

Verificação realizada: preparação do ZIP e nova verificação local aprovadas. `portalHistoryAssets.test.ts`: 4 testes aprovados, protegendo os bytes canônicos dos 52 caminhos, transparência e dimensões das 24 variantes, os 25/12/13 registros, os tipos representativos e a identificação de 2022/2024/2026.
