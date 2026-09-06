# Auditoria das imagens — Histórias da Fenasoja

Revisão: 6 de setembro de 2026. Foram lidos o briefing completo, as 51 fichas do catálogo e os metadados das 21 imagens do pacote. A folha de referências e **cada uma das 21 imagens originais** foram conferidas visualmente. Os arquivos locais foram também inspecionados para dimensões, EXIF e SHA-256. O JSON [historias-fenasoja-imagens.json](historias-fenasoja-imagens.json) guarda os resultados por imagem.

## Autorização e alcance

O pacote original informa que é uma referência editorial e não concede licença das fotografias. Antes de incorporar imagens, o usuário respondeu **“Sim pode colocar as fotos”** à questão sobre autorização de uso nesta tarefa. Foi registrada em cada imagem a seguinte origem:

> Autorização declarada pelo usuário nesta tarefa, 2026-09-06: Sim pode colocar as fotos; uso no expo-logistics-hub; titular não informado

Essa declaração é a base para incorporar o subconjunto verificado neste projeto. **Não é uma licença pública concedida pela instituição de origem**, não comprova a titularidade do usuário e não permite inventar autor, detentor ou alcance para outros projetos. `permission.sourceUrl` permanece `null`, pois a origem é a conversa. O titular patrimonial e eventual documento emitido por ele continuam pendentes no catálogo de manutenção.

Não houve contato com instituições, fotógrafos ou pessoas retratadas. Nenhuma imagem foi gerada com IA, retocada, reconstruída, colorizada ou apresentada como antes/depois. Créditos institucionais e pessoais conhecidos foram conservados separadamente. O nome do redator e o avatar “Foto de Helson George” não foram promovidos a crédito fotográfico.

## Nove imagens incorporadas

| Imagem | História / ID real de referência | Identidade e papel editorial | Captura / publicação | Crédito e acervo |
| --- | --- | --- | --- | --- |
| I04 | P07 / `reference:2026:b10` (`B10`) | Cerimônia junto ao Pavilhão da Agroindústria Familiar. Registro recente; piloto com uma imagem. | Captura não confirmada; publicada 01/05/2026. EXIF conflitante detalhado abaixo. | Autor pessoal não confirmado; publicação Fenasoja. |
| I05 | H08 / `reference:2026:c8` (`C8`) | Fachada noturna com “Etnia Alemã” e Centro Cultural 25 de Julho visíveis. Registro da reforma. | Captura não confirmada; publicada 03/05/2026. | Autor pessoal não confirmado; Prefeitura Municipal de Santa Rosa/RS. |
| I08 | H22 / `reference:2026:f` (`F`) | Arena e público; marca mrJack.bet da edição preservada. Registro recente de evento. | Captura não confirmada; publicada 24/06/2024. | Autor pessoal não confirmado; publicação Fenasoja. |
| I10 | H14 / `reference:2026:b7` (`B7`) | Oficina na Cozinha da Soja; atividade no interior, sem inventar uma fachada. | Captura não confirmada; publicada 02/05/2026. | Autor pessoal não confirmado; publicação Fenasoja. O arquivo menciona Mateus de Oliveira, insuficiente por si só. |
| I15 | H09 / `reference:2026:c6` (`C6`) | Encontro na sede da Etnia Italiana, identificada expressamente pela notícia. | Captura não confirmada; publicada 25/08/2026. | Autor pessoal não confirmado; publicação Fenasoja. |
| I16 | H26 / `reference:2026:c1` (`C1`) | Abertura de encontro no Centro de Eventos, sem afirmar equivalência com Restaurante Fenasoja. | Captura 08/05/2026: EXIF corroborado pela data do evento no texto; publicada 09/05/2026. | Autor pessoal não confirmado; publicação Fenasoja. |
| I18 | H04/H05 / `reference:2026:g` (`G`) | Conjunto do monumento Apollo 14 e Árvore Lunar em Santa Rosa. Contexto documental sem data de captura. | Captura não confirmada; publicada 13/08/2026. | Autoria pessoal desconhecida; reprodução de Santa Rosa Tur pelo Jornal Noroeste. |
| I19 | H04/H05 / `reference:2026:g` (`G`) | Monumento e Árvore Lunar em cobertura contemporânea da inauguração. Registro de época de 2018; não é fotografia do plantio de 1981. | Dia da captura não confirmado; publicada 04/05/2018. | Felipe Dorneles / Especial / Correio do Povo, explicitamente atribuído na legenda original. |
| I21 | H23 / `reference:2026:b13` (`B13`) | Apresentação sob a cobertura do Palco Cultural Lactalis; identidade corroborada por faixa e notícia. | Captura não confirmada; publicada 03/05/2026. | Autor pessoal não confirmado; publicação Fenasoja. |

Os identificadores de referência são canônicos do mapa; o catálogo de correspondências também registra a resolução para o `publicIdentifier` persistente. H04 e H05 compartilham o único conjunto G, sem criar ou duplicar estruturas. A presença de duas imagens desse conjunto não constitui comparação temporal rigorosa nem slider antes/depois.

## Doze referências mantidas somente em pesquisa

| Imagem | Resultado da inspeção | Pendência que impede a inclusão atual |
| --- | --- | --- |
| I01 | Grupo no auditório; painel Fenasoja 2026, palco, cadeiras e corredor central. EXIF 04/05/2026 coerente com a matéria. | ID do auditório não resolvido; não é Casa Fenasoja/Galeria. |
| I02 | Panorama aéreo com várias edificações e circulação. | História do conjunto; não identifica individualmente Mirante, Churrascaria, Pavilhão 14 ou Palco. |
| I03 | Grupo diante da placa “Ambulatório”. | Correspondência do ambulatório com objeto publicável pendente; não usar para Restaurante. |
| I06 | Serviço de buffet sem placa ou fachada identificadora. | Somente contexto gastronômico da Praça das Nações; não identifica uma estrutura individual. O texto da fonte S06 foi conferido após recuperação do HTML público. |
| I07 | Tela de cinema com trecho do documentário. Corpo da notícia credita Clóvis Pacheco. | Não é plantio de 1981; além da fotografia, procedência e direitos do filme projetado precisam ser esclarecidos. |
| I09 | Placa “Parquinho do Sojinha” e brinquedos. | Correspondência com entidade permanente publicável pendente; não usar para parque itinerante. |
| I11 | Descerramento de placa de pedra fundamental da Casa Portuguesa. | Não comprova prédio concluído nem autoriza criar uma casa no mapa. |
| I12 | Área arborizada com edificações de convivência e marca d’água Santa Rosa Tur. | Uso editorial apenas no conjunto do parque; não inferir qual prédio é cada estabelecimento. |
| I13 | Prédio de dois pavimentos com mural, em miniatura 300 × 200. | Identidade individual e fonte de maior resolução pendentes; não usar como capa. |
| I14 | Prédio térreo sob árvores, em miniatura 300 × 200. | Identidade individual e fonte de maior resolução pendentes; não associar por aparência. |
| I17 | Edificação em obras, pergolado e rampa sem identificação individual legível. | A matéria aborda várias obras; permanece candidata a P07/H21 até confirmação da fotografia. |
| I20 | Cerimônia com placa “Casa Fenasoja — Herberto Werner”. Crédito Gisele Flores/O Sul explícito. | Correspondência física da Casa Fenasoja pendente; não transferir para sede/Comissão Central. |

## Procedência e condições das fontes

Cada URL de página e de arquivo original consta no JSON. Foram consultadas as páginas correspondentes às 21 imagens. S06 retornou erro inicialmente no extrator web; posteriormente, seu texto foi recuperado diretamente do HTML público e conferido, como registrado no catálogo de correspondências. Isso sustenta os textos associados à Praça das Nações, mas não resolve a identidade de uma estrutura individual na fotografia contextual I06, que permanece em pesquisa. A situação de uso foi consultada nos próprios sites:

- O [banco de fotos Fenasoja](https://fenasoja.com.br/banco-de-fotos-e-videos/) existe e disponibiliza registros, mas não apresenta nessa página uma licença geral de reutilização. O rodapé reserva os direitos. Isso não foi tratado como autorização institucional.
- Os [termos Santa Rosa Tur](https://www.santarosatur.com.br/termos-e-condicoes/) requerem autorização expressa para reprodução e uso comercial. A atribuição institucional de I12–I14 e I18 não revela autoria pessoal.
- Os [termos do Jornal Noroeste](https://jornalnoroeste.com.br/termos-de-uso/) condicionam exibição à preservação dos direitos e créditos, incluindo terceiros. I18 está atribuída a Santa Rosa Tur, portanto não foi inferida uma licença de terceiros a partir desses termos.
- A [página Correio do Povo](https://www.correiodopovo.com.br/not%C3%ADcias/cidades/santa-rosa-inaugura-r%C3%A9plica-da-apollo-14-durante-a-fenasoja-1.260563) fornece crédito fotográfico pessoal e reserva os direitos.
- A [página O Sul](https://www.osul.com.br/fenasoja-homenageia-voluntarios-celebra-historia-e-inaugura-monumento-a-soja/) identifica a fotografia de I20 como Gisele Flores/O Sul. Não foi encontrada licença aberta nela.
- A [página municipal da Etnia Alemã](https://prefeitura.santarosa.rs.gov.br/?p=16700) permite confirmar local e publicação em 03/05/2026; não informa autor pessoal ou licença aberta.

Foi pesquisada uma alternativa factual da NASA antes da autorização do usuário: lançamento real Apollo 14 no Kennedy Space Center, 31/01/1971, com crédito NASA/JSC e condições editoriais explícitas. **Nenhuma imagem NASA foi incorporada** após autorização do acervo local. Nenhuma árvore de outra cidade foi apresentada como Santa Rosa.

## Datas e divergências preservadas

- I04 contém `DateTimeOriginal = 2026:02:04 04:22:49`. Essa data diverge da notícia de maio e não foi convertida em data de captura. O catálogo e a UI conservam captura `null`; a legenda descreve somente o período da publicação.
- I16 contém `DateTimeOriginal = 2026:05:08 10:08:02`, coerente com a notícia que identifica o evento na manhã de 8 de maio. A publicação ocorreu no dia seguinte. O campo de captura usa precisão de dia, sem reproduzir horário ou fuso não comprovado.
- I01 contém `DateTimeOriginal = 2026:05:04 20:41:40`, coerente com o quarto dia da feira relatado em notícia publicada em 5 de maio. Continua em pesquisa devido ao vínculo físico.
- Nos demais 18 arquivos não foi encontrado EXIF que confirme data de captura. Datas de upload, nomes de arquivo e publicação não foram utilizadas como substitutos.
- A [lista Moon Trees da NASA](https://www.nasa.gov/history/moon-trees/) registra Santa Rosa em 18/08/1981; as notícias locais do [Correio do Povo](https://www.correiodopovo.com.br/not%C3%ADcias/cidades/santa-rosa-inaugura-r%C3%A9plica-da-apollo-14-durante-a-fenasoja-1.260563) e do [Jornal Noroeste](https://jornalnoroeste.com.br/noticia/comportamento/santa-rosa-marca-45-anos-do-plantio-da-arvore-lunar) indicam 13/08/1981. A apresentação pública usa agosto de 1981, preservando a divergência para confirmação pelo acervo local. A NASA confirma o mecanismo científico: sementes viajaram ao redor da Lua e germinaram na Terra.
- A notícia Noroeste de 2026 imprecisamente associa o monumento à última feira; a fonte contemporânea do Correio do Povo comprova inauguração em 2018. O texto público não replica essa imprecisão.
- P07 conserva reforma em maio de 2026 e construção em 1987; “1º/04” no corpo da fonte de maio não foi reproduzido como dia confirmado.

## Assets, integridade e verificação

`public/history/originals/` conserva cópias byte a byte das nove imagens incorporadas. O SHA-256 de cada original está no catálogo de pesquisa. Os derivados em `public/history/` mantêm a imagem inteira, com somente redução de resolução e conversão de formato; não há recortes nos arquivos, tratamento generativo ou remoção de marcas e pessoas.

Foram gerados WebP de 400, 800 e 1200 pixels quando a resolução original permite, fallback JPEG de até 800 pixels e ampliação WebP de até 1800 pixels. Fontes menores mantêm a resolução nativa, sem ampliação artificial. O campo `variants` declara a largura real. O piloto I04 oferece WebP de 800 pixels com 37.594 bytes e ampliação com 121.884 bytes.

O módulo `media.ts` contém somente as nove imagens aprovadas; os doze rascunhos não têm assets públicos. O catálogo registra vínculo, verificação visual, autorização e URLs de procedência separadamente. Fotos com créditos pessoais desconhecidos exibem o acervo/origem sem transformar isso em autoria.

Validações da camada de mídia: leitura completa dos 21 arquivos, verificação de dimensões, inspeção EXIF, comparação SHA-256 dos nove originais copiados, inspeção visual dos derivados de amostra e checagem dos arquivos declarados. Os testes funcionais de galeria, painel e preservação de seleção/câmera pertencem ao relatório integrado de validação da funcionalidade.
