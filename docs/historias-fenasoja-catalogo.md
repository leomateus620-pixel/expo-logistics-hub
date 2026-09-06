# Histórias da Fenasoja — catálogo e correspondências

Revisão editorial e técnica: 6 de setembro de 2026. Insumos: leitura integral de PROMPT_HISTORIAS_FENASOJA.md e dos 51 itens de catalogo_historias.json fornecidos pelo usuário. O documento anexo foi tratado como referência de pesquisa; o pedido explícito do usuário governa a implementação e a autorização posterior de uso das fotografias.

21 histórias publicadas, ligadas a 21 identidades já existentes. São 51 referências editoriais, não 51 prédios. H05 integra H04; H21 integra P07; P04 remete a H14. Os demais 27 itens permanecem pendentes, em conjunto ou fora da cena. Nenhum prédio, coordenada ou marcador foi criado.

## Autoridade dos IDs e limites do inventário

As identidades foram conferidas executando OFFICIAL_REFERENCE_ENTITIES de src/features/commercial-map/data/officialReference2026.ts (revisão2026.4), e comparando os contratos em utils/landmarks.ts. O catálogo mantém os IDs reais da referência `reference:2026:*`. No banco, a chave primária pode ser UUID; o vínculo em tempo de execução usa exclusivamente a allowlist dos códigos persistentes `publicIdentifier`, nunca nome, substring, semelhança visual, proximidade, posição ou ID de mesh. Entidades arquivadas são recusadas. Não foi feita afirmação de auditoria de UUIDs de uma base remota específica.

O inventário contém 156 entidades não vendáveis: 111 mantidas no payload e 45 retiradas da cena por NON_PERMANENT_REMOVED_IDENTIFIERS_2026. Inclui quadras, vias e áreas; portanto não equivale à contagem de prédios permanentes. Todas estão listadas abaixo, inclusive as ausentes na pesquisa. Módulos comerciais internos e lotes não são estruturas históricas independentes; nenhum herda ficha do pavilhão automaticamente.

Na apresentação já existente (`withUnifiedFenasojaRestaurant`), C3/Pizzaria é absorvido por C2/Restaurante Central, cujo alias é Restaurante Fenasoja. Isso deixa 110 entidades não vendáveis após a unificação visual, sem alterar o cadastro acima. C1/Centro de Eventos permanece separado. O alias não comprova que a notícia de inauguração do restaurante em 2024 descreva C2; H25 continua em rascunho.

Geometrias auxiliares de paisagismo, casas de entorno e meshes de apoio não têm identidade selecionável própria no cadastro; permanecem apresentação da cena. O módulo dos60anos (B14) está inventariado como retirado. Não foi localizado ID permanente individual de “Floricultura”; identidade e permanência seguem pendentes.

## Tabela dos 51 itens

“Publicado” refere-se ao texto aprovado e habilitado no painel. Fotografias têm aprovação independente; a ausência de imagem não bloqueia texto comprovado. “Incorporado”/“remete” preserva uma única ficha na seleção.

| Pesquisa | Referência editorial | ID real / código persistente | Situação | Decisão e pendência |
|---|---|---|---|---|
| H01 | Casa Fenasoja — Casa Herberto Werner | Sem ID real comprovado | rascunho | Casa Fenasoja não tem ID individual identificado. B12 é a sede/Comissão Central; a homenagem a Herberto Werner não foi atribuída à sede. |
| H02 | Galeria dos Voluntários | Sem ID real comprovado | filho em rascunho | parentHistoryId=H01; galeria interna sem entidade independente. Depende do vínculo da Casa. |
| H03 | Monumento à cultivar Santa Rosa | Sem ID real comprovado | rascunho | Monumento à cultivar sem entidade identificada. B30 designa voluntariado e B14 é módulo dos 60 anos, ambos retirados da cena; não equivalem a esta ficha. |
| H04 | Árvore Lunar | `G` (reference:2026:g) | publicado | Plantio público usa agosto1981: NASA registra18/08 e Correio do Povo13/08. Sementes germinaram na Terra; monumento é homenagem2018. |
| H05 | Monumento da Apollo 14 | `G` (reference:2026:g) | incorporado a H04 | parentHistoryId=H04. O mesh Apollo e a árvore compartilham G; marco2018 e fotos do conjunto na ficha H04, sem segundo prédio. |
| H06 | Praça das Nações | `B20` (reference:2026:b20) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H07 | Pórtico das Nações | `PORTICO-NACOES` (reference:2026:portico-nacoes) | rascunho documental | ID individual localizado; retrospectiva de 2008 em rede social não teve conteúdo revalidado. Marco2008 permanece pendente. |
| H08 | Casa da Etnia Alemã — Centro Cultural 25 de Julho | `C8` (reference:2026:c8) | publicado | Reforma2026. Participação alemã desde1995 ocorreu em outro ambiente; não é data de construção da casa atual. |
| H09 | Casa da Etnia Italiana | `C6` (reference:2026:c6) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H10 | Casa da Etnia Polonesa — Centro Cultural Brasileiro-Polonês | `C5` (reference:2026:c5) | publicado | Fonte da Assessoria da Fenasoja, publicada pela Cultivar, confirma conclusão março2012 e abertura ao público na feira; cerimônia oficial ainda era planejada. |
| H11 | Casa da Etnia Africana | `C7` (reference:2026:c7) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H12 | Casa da Etnia Portuguesa — pedra fundamental | `ESPACO-ETNIA-PORTUGUESA` (reference:2026:espaco-etnia-portuguesa) | rascunho | O ID é área destinada à etnia, não casa concluída. Fonte2026 registra pedra fundamental e captação futura para construção. |
| H13 | Monumento ao Trabalho Voluntário | `B30` (reference:2026:b30) | rascunho | ID cartográfico Monumento do Voluntariado retirado do payload2026.4. Vínculo ao monumento2006 e permanência física precisam de prova. |
| H14 | Cozinha da Soja — Cozinha da Neca | `B7` (reference:2026:b7) | publicado | Cozinha2014 no Pavilhão4 explícita em S13. Data da denominação Cozinha da Neca não confirmada; homenagem sem data. |
| H15 | Casa do Leite / Espaço do Cooperativismo | `B28` (reference:2026:b28) | publicado | S25 resolvida em permalink: afirma expressamente que antigo espaço Casa do Leite passa a Espaço do Cooperativismo em2022. S29 confirma nome2026. Um único B28. |
| H16 | Casa do Núcleo de Criadores de Cavalos Crioulos | `D5` (reference:2026:d5) | publicado | Manual2026 identifica a Casa do Núcleo. Texto não atribui provas de outra sede a este edifício nem data construção. |
| H17 | Pavilhão de Remates | Sem ID real comprovado | rascunho | Programação2014 menciona Pavilhão de Remates. Não existe entidade com esse nome; B9/Pavilhões6,10,11 e PAVILHAO-09 não foram associados por suposição. |
| H18 | Pista campeira | `PISTA-CAMPEIRA` (reference:2026:pista-campeira) | publicado | Identidade exata Pista Campeira no cadastro e programação2014. Publicado apenas marco de uso documentado. |
| H19 | Exporural | `EXPORURAL` (reference:2026:exporural) | publicado | História do setor EXPORURAL, sem propagação para lotes, expositores ou ruas individuais. |
| H20 | Acesso e pórtico da Exporural | Sem ID real comprovado | rascunho | Fonte oficial confirma acesso e pórtico Exporural2016, mas não há ID específico demonstrado no traçado atual. Não equivale automaticamente aos portões A6/A7/A8/A9/A11. |
| H21 | Praça Raízes da Terra | `B10` (reference:2026:b10) | incorporado a P07 | parentHistoryId=P07. Praça externa documentada na reforma2026 é conteúdo do conjunto do pavilhão. Não foi criada uma praça selecionável adicional. |
| H22 | Arena Fenasoja e Complexo Poliesportivo e Cultural | `F` (reference:2026:f) | publicado | Uma Arena F com etapas2022/2024. Fontes registram cerimônias junho e dezembro2024; não representam novas arenas. |
| H23 | Espaço Cultural / Palco Cultural Lactalis | `B13` (reference:2026:b13) | publicado | Publicada somente programação do Palco Cultural Lactalis2026. Continuidade arquitetônica com Espaço Cultural2022 permanece pendente. |
| H24 | Centro Administrativo e auditório | `B11` (reference:2026:b11) | publicado | Uso do auditório2014 registrado expressamente. Não confundir B11 Centro Administrativo com C1 Centro de Eventos ou B12 sede. |
| H25 | Restaurante Fenasoja | Sem ID real comprovado | rascunho | Fonte2024 descreve Restaurante Fenasoja também como centro de eventos. Cadastro contém C1 Centro de Eventos e C2 Restaurante Central com volumes distintos. Fato2024 não atribuído a nenhum deles sem prova; H26 publica só uso2026 de C1. |
| H26 | Centro de Eventos Fenasoja | `C1` (reference:2026:c1) | publicado | Publicado apenas encontro08/05/2026, com cerca450 estudantes, explicitamente neste Centro de Eventos. Relação restaurante2024 continua pendente em H25. |
| H27 | Churrascaria da Exporural | `C4` (reference:2026:c4) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H28 | Mirante | `D3` (reference:2026:d3) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H29 | Via Expressa — área coberta de alimentação | `D2` (reference:2026:d2) | publicado | D2 é área de alimentação;2014 marca instalação da cobertura, não criação de uma via. |
| H30 | Pórtico do Portão 1 | `A1` (reference:2026:a1) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |
| H31 | Ambulatório Médico | `B23` (reference:2026:b23) | fora da cena | Texto do ambulatório2024 confirmado em S03; B23 retirado por NON_PERMANENT_REMOVED_IDENTIFIERS_2026. A funcionalidade não reintroduz esse volume. |
| H32 | Parquinho do Sojinha | `B18` (reference:2026:b18) | fora da cena | B18 Parque Infantil Sojinha retirado por NON_PERMANENT_REMOVED_IDENTIFIERS_2026. Não equivale a J, o parque de diversões. |
| H33 | Catavento junto à churrascaria | Sem ID real comprovado | rascunho | Catavento não é entidade semântica própria cadastrada; divulgação2026 não documenta autoria ou implantação. |
| H34 | Alameda Fenasoja 50 Anos | Sem ID real comprovado | rascunho | Alameda Fenasoja50Anos2016 não foi identificada por ID ou percurso. D1 é Alameda Gastronômica, já citada na retrospectiva2004; não são aliases comprovados. |
| H35 | Blocos sanitários e acessibilidade | `E-01` (reference:2026:e-01); `E-02` (reference:2026:e-02); `E-03` (reference:2026:e-03); `E-04` (reference:2026:e-04); `E-05` (reference:2026:e-05); `E-06` (reference:2026:e-06); `E-07` (reference:2026:e-07); `E-08` (reference:2026:e-08); `E-09` (reference:2026:e-09); `E-10` (reference:2026:e-10); `E-11` (reference:2026:e-11); `E-12` (reference:2026:e-12); `E-13` (reference:2026:e-13); `E-14` (reference:2026:e-14); `E-15` (reference:2026:e-15); `E-16` (reference:2026:e-16); `E-17` (reference:2026:e-17); `E-18` (reference:2026:e-18); `E-19` (reference:2026:e-19); `E-20` (reference:2026:e-20); `E-21` (reference:2026:e-21); `E-22` (reference:2026:e-22); `E-23` (reference:2026:e-23); `E-24` (reference:2026:e-24); `E-25` (reference:2026:e-25); `E-26` (reference:2026:e-26) | conjunto em rascunho | Blocos E-01 a E-26 retirados da cena2026.4. Não há datas individuais; nenhum marco genérico foi replicado nos sanitários. |
| H36 | Sede administrativa / Comissão Central | `B12` (reference:2026:b12) | rascunho documental | Sede/Comissão Central identificada pelo cadastro e manual2026. História de implantação e relação com Casa Fenasoja pendentes; não herda H01. |
| H37 | Conjunto do Parque de Exposições | Sem ID real comprovado | conjunto em rascunho | Parque como conjunto não tem entidade selecionável única; projectId reference:fenasoja-2026 identifica projeto, não prédio. Não replicar história geral em cada edifício. |
| P01 | Pavilhão 1 | `B1` (reference:2026:b1) | rascunho documental | Pavilhão1 identificado; história individual, implantação e fotos pendentes. |
| P02 | Pavilhão 2 | Sem ID real comprovado | rascunho | Nenhum Pavilhão2 identificado no cadastro. B2 é Pavilhão14; não usar a numeração do código B como número do pavilhão. |
| P03 | Pavilhão 3 | `B6` (reference:2026:b6) | rascunho documental | Pavilhão3 identificado; história individual, implantação e fotos pendentes. |
| P04 | Pavilhão 4 | `B7` (reference:2026:b7) | remete a H14 | Pavilhão4 e Cozinha da Soja compartilham B7. Uma história publicada (H14), sem ficha concorrente. |
| P05 | Pavilhão 5 | `B8` (reference:2026:b8) | rascunho documental | Pavilhão5 Veterinária/Pequenos Animais/Rações identificado. História individual pendente. |
| P06 | Pavilhão 6 | `B9` (reference:2026:b9) | conjunto em rascunho | Cadastro agrupa Pavilhões6,10e11 em B9. Não há três IDs individuais; nenhuma história copiada para os meshes. |
| P07 | Pavilhão 7 — Agroindústria Familiar | `B10` (reference:2026:b10) | publicado | Construção1987 e reforma maio2026. Erro1º/04 no corpo de S04 não reproduzido. H21 incluída no texto do conjunto. |
| P08 | Pavilhão 8 | `B4` (reference:2026:b4) | rascunho documental | Pavilhão8 identificado; história individual, implantação e fotos pendentes. |
| P09 | Pavilhão 9 | `PAVILHAO-09` (reference:2026:pavilhao-09) | rascunho documental | Pavilhão9 tem ID próprio. Não foi confundido com pavilhão de remates nem com B9. |
| P10 | Pavilhão 10 | `B9` (reference:2026:b9) | conjunto em rascunho | Mesmo conjunto de P06/P11; sem ID individual e sem data de construção documentada. |
| P11 | Pavilhão 11 | `B9` (reference:2026:b9) | conjunto em rascunho | Mesmo conjunto de P06/P10; sem ID individual e sem data de construção documentada. |
| P12 | Pavilhão 12 | `B3` (reference:2026:b3) | rascunho documental | Pavilhão12 identificado; história individual, implantação e fotos pendentes. |
| P13 | Pavilhão 13 | `B5` (reference:2026:b5) | rascunho documental | Pavilhão13 identificado; história individual, implantação e fotos pendentes. |
| P14 | Pavilhão 14 | `B2` (reference:2026:b2) | publicado | Nome e código exatos conferidos no cadastro; publicado somente texto sustentado pelas fontes listadas. Datas de construção não inferidas. |

## Conteúdo publicado e fontes efetivamente usadas

Os textos públicos estão em `src/features/commercial-map/history/catalog.ts`, carregado sob demanda. O arquivo não inclui rascunhos, URLs privadas ou informações comerciais. A publicação editorial não altera nomes comerciais e patrocinadores cadastrados.

| Ficha | Estrutura selecionável | Fontes do texto | Imagens publicadas |
|---|---|---|---|
| H04 | Árvore Lunar e monumento da Apollo 14 (G) | S30, S22 | I18, I19 |
| H06 | Praça das Nações (B20) | S06 | Sem fotografia; texto disponível |
| H08 | Casa da Etnia Alemã (C8) | S05 | I05 |
| H09 | Casa da Etnia Italiana (C6) | S06, S16 | I15 |
| H10 | Casa da Etnia Polonesa (C5) | S12 | Sem fotografia; texto disponível |
| H11 | Casa da Etnia Africana (C7) | S06 | Sem fotografia; texto disponível |
| H14 | Cozinha da Soja (B7) | S10, S13 | I10 |
| H15 | Espaço do Cooperativismo (B28) | S25, S29 | Sem fotografia; texto disponível |
| H16 | Casa do Núcleo de Criadores de Cavalos Crioulos (D5) | S29 | Sem fotografia; texto disponível |
| H18 | Pista Campeira (PISTA-CAMPEIRA) | S28 | Sem fotografia; texto disponível |
| H19 | Exporural (EXPORURAL) | S03 | Sem fotografia; texto disponível |
| H22 | Arena Fenasoja (F) | S02, S08, S03 | I08 |
| H23 | Palco Cultural Lactalis (B13) | S23 | I21 |
| H24 | Centro Administrativo e auditório (B11) | S28 | Sem fotografia; texto disponível |
| H26 | Centro de Eventos Fenasoja (C1) | S17 | I16 |
| H27 | Churrascaria da Exporural (C4) | S02 | Sem fotografia; texto disponível |
| H28 | Espaço Mirante (D3) | S02 | Sem fotografia; texto disponível |
| H29 | Via Expressa (D2) | S13 | Sem fotografia; texto disponível |
| H30 | Pórtico do Portão 1 (A1) | S13 | Sem fotografia; texto disponível |
| P07 | Pavilhão 7 — Agroindústria Familiar (B10) | S04 | I04 |
| P14 | Pavilhão 14 (B2) | S02 | Sem fotografia; texto disponível |

- **S02** — [Novos espaços foram inaugurados na Fenasoja](https://fenasoja.com.br/portal-oficial/geral/novos-espacos-foram-inaugurados-na-fenasoja/). Fenasoja; leitura conferida em06/09/2026.
- **S03** — [Novas estruturas do parque foram inauguradas na tarde desta quarta-feira](https://fenasoja.com.br/portal-oficial/geral/novas-estruturas-do-parque-foram-inauguradas-na-tarde-desta-quarta-feira/). Fenasoja; leitura conferida em06/09/2026.
- **S04** — [Fenasoja 2026: Tradição e renovação marcam abertura do Pavilhão da Agroindústria Familiar](https://fenasoja.com.br/portal-oficial/agricultura-familiar/fenasoja-2026-tradicao-e-renovacao-marcam-abertura-do-pavilhao-da-agroindustria-familiar/). Fenasoja; leitura conferida em06/09/2026.
- **S05** — [Obra da casa da Etnia Alemã é inaugurada durante a Fenasoja – Prefeitura Municipal de Santa Rosa/RS](https://prefeitura.santarosa.rs.gov.br/?p=16700). Prefeitura Municipal de Santa Rosa; leitura conferida em06/09/2026.
- **S06** — [Cultura e Gastronomia reunidas na Praça das Nações](https://fenasoja.com.br/portal-oficial/cultura/cultura-e-gastronomia-reunidas-na-praca-das-nacoes/). Fenasoja; leitura conferida em06/09/2026.
- **S08** — [Arena e Complexo Poliesportivo e Cultural foram inaugurados com grande festa no Parque de Exposições](https://fenasoja.com.br/portal-oficial/geral/arena-e-complexo-poliesportivo-e-cultural-foram-inaugurados-com-grande-festa-no-parque-de-exposicoes/). Fenasoja; leitura conferida em06/09/2026.
- **S10** — [Fenasoja 2026: Cozinha da Soja destaca valor nutricional e versatilidade do grão em oficinas diárias](https://fenasoja.com.br/portal-oficial/geral/fenasoja-2026-cozinha-da-soja-destaca-valor-nutricional-e-versatilidade-do-grao-em-oficinas-diarias/). Fenasoja; leitura conferida em06/09/2026.
- **S12** — [    Etnia polonesa abrirá Centro Cultural durante a 19ª Fenasoja - Revista Cultivar ](https://revistacultivar.com.br/noticias/etnia-polonesa-abrira-centro-cultural-durante-a-19o-fenasoja). Revista Cultivar / Assessoria de Imprensa da Fenasoja; leitura conferida em06/09/2026.
- **S13** — [Fenasoja - A Maior Feira Multissetorial do Brasil Fenasoja](https://ftp.fenasoja.com.br/edicoes-anteriores). Fenasoja; leitura conferida em06/09/2026.
- **S16** — [Lançamento da Fiesta del Inmigrante aproxima Brasil e Argentina](https://fenasoja.com.br/portal-oficial/geral/lancamento-da-fiesta-del-inmigrante-aproxima-brasil-e-argentina/). Fenasoja; leitura conferida em06/09/2026.
- **S17** — [Cooperativismo escolar reúne centenas de estudantes na Fenasoja 2026](https://fenasoja.com.br/portal-oficial/uncategorized/cooperativismo-escolar-reune-centenas-de-estudantes-na-fenasoja-2026/). Fenasoja; leitura conferida em06/09/2026.
- **S22** — [Santa Rosa inaugura réplica da Apollo 14 durante a Fenasoja](https://www.correiodopovo.com.br/not%C3%ADcias/cidades/santa-rosa-inaugura-r%C3%A9plica-da-apollo-14-durante-a-fenasoja-1.260563). Correio do Povo; leitura conferida em06/09/2026.
- **S23** — [Cultura, arte e música marcam o domingo no Palco Cultural Lactalis](https://fenasoja.com.br/portal-oficial/uncategorized/cultura-arte-e-musica-marcam-o-domingo-no-palco-cultural/). Fenasoja; leitura conferida em06/09/2026.
- **S25** — [Cooperativas da região de Santa Rosa se unem na Fenasoja 2022](https://somoscooperativismo-rs.coop.br/noticias-inovacao/cooperativas-da-regiao-de-santa-rosa-se-unem-em-comissao-inedita-na-fenasoja-2022-4715). Sistema Ocergs / Fenasoja; leitura conferida em06/09/2026.
- **S28** — [Programação da Fenasoja 2014](https://agron.com.br/publicacoes/informacoes/eventos-e-lazer/2014/04/24/039194/fenasoja). Agron / Programação Fenasoja 2014; leitura conferida em06/09/2026.
- **S29** — [Manual do Expositor Fenasoja 2026](https://fenasoja.com.br/manual_do_expositor_fenasoja_2026-revisado-e-atualizado-28-07-25/). Fenasoja; leitura conferida em06/09/2026.
- **S30** — [NASA: Moon Trees](https://www.nasa.gov/history/moon-trees/). NASA; leitura conferida em06/09/2026.

S06 e S12 responderam com erro no extrator web, mas o conteúdo integral útil foi recuperado diretamente do HTML público e conferido. S25 foi resolvida da página de índice para o permalink da matéria da Fenasoja reproduzida pelo Sistema Ocergs. S29 foi lida no PDF, página9 (artigo28), identificando Casa do Núcleo e Espaço do Cooperativismo. Os códigos de fontes ficam no catálogo de manutenção, não na interface pública.

## Conflitos documentais e decisões

- **Árvore Lunar:** a tabela da NASA registra18/08/1981; a notícia contemporânea do Correio do Povo sobre o monumento informa13/08/1981. O público vê agosto1981 até conciliação com documento original do plantio. S07 e S22 contêm a afirmação incorreta de germinação lunar; o texto segue a NASA: sementes em órbita, germinação na Terra. Não se afirma exclusividade no Brasil.
- **Casa Fenasoja / sede:** a homenagem2026 é documentada no pacote, mas não há correspondência física comprovada da Casa no cadastro. B12 continua sede/Comissão Central e não recebeu H01/H02. Ano da homenagem nunca virou ano de construção.
- **Restaurante / Centro de Eventos:** S03 relaciona os dois usos; o cadastro possui C1 e C2 separados. H26 publica apenas o encontro2026 nominalmente identificado em C1; H25 fica pendente. A novidade2024 não foi copiada para dois prédios.
- **Casa do Leite / Cooperativismo:** S25 nomeia explicitamente a mudança de uso do mesmo espaço em2022 e S29 mantém Espaço do Cooperativismo2026. Um B28, uma ficha H15. Data de construção2008 não publicada sem confirmação específica.
- **Palco Cultural:** B13 recebe somente a programação2026 documentada. Não foi publicada continuidade física nem inauguração2022 para esse objeto.
- **Pavilhão7:** S04 publica a notícia em01/05/2026 mas escreve1º/04 no corpo. Marco público com precisão mensal maio2026, construção1987 separada da reforma. Pavilhão4/B7 é outra entidade.
- **Casa Polonesa:** conclusão março2012 e uso na feira documentados; a fonte ainda anunciava futura cerimônia oficial. Não se inventou data de inauguração.
- **Estruturas retiradas:** B18/Sojinha, B23/Ambulatório e B30/Voluntariado constam do catálogo cartográfico, mas foram retirados do payload existente. Não se reverteu essa decisão de cena nesta funcionalidade.

## Rascunhos e lacunas por ficha

Conteúdo abaixo é material de manutenção e não é entregue pelo catálogo público. Os resumos de pesquisa preservam afirmações a confirmar e não devem ser promovidos automaticamente. O cadastro de mídia independente documenta procedência, créditos, datas, licenças e inspeção visual em `docs/historias-fenasoja-imagens.json` e `docs/historias-fenasoja-imagens.md`.

### H01 — Casa Fenasoja — Casa Herberto Werner

Situação: **rascunho**. Casa Fenasoja não tem ID individual identificado. B12 é a sede/Comissão Central; a homenagem a Herberto Werner não foi atribuída à sede.

Referência editorial fornecida (não publicação independente): Espaço de memória institucional, recebeu em maio de 2026 o nome de Herberto Werner, presidente da edição de 1992. Preserva a história de quem construiu a feira.

Fontes candidatas: S01, S24. Fotografias ainda necessárias: Fachada antiga, placa de denominação e foto atual identificadas.

### H02 — Galeria dos Voluntários

Situação: **filho em rascunho**. parentHistoryId=H01; galeria interna sem entidade independente. Depende do vínculo da Casa.

Referência editorial fornecida (não publicação independente): Integrada à Casa Fenasoja, reúne placas com os nomes dos presidentes e voluntários. Foi atualizada nas comemorações dos 60 anos, em 2026.

Fontes candidatas: S01. Fotografias ainda necessárias: Fotos legíveis das placas antigas e atuais.

### H03 — Monumento à cultivar Santa Rosa

Situação: **rascunho**. Monumento à cultivar sem entidade identificada. B30 designa voluntariado e B14 é módulo dos 60 anos, ambos retirados da cena; não equivalem a esta ficha.

Referência editorial fornecida (não publicação independente): Inaugurado em maio de 2026 em frente à Casa Fenasoja, homenageia a variedade de soja Santa Rosa, lançada na primeira edição da feira, em 1966.

Fontes candidatas: S01, S24. Fotografias ainda necessárias: Foto integral do monumento e detalhe da inscrição.

### H05 — Monumento da Apollo 14

Situação: **incorporado a H04**. parentHistoryId=H04. O mesh Apollo e a árvore compartilham G; marco2018 e fotos do conjunto na ficha H04, sem segundo prédio.

Referência editorial fornecida (não publicação independente): Inaugurado durante a Fenasoja de 2018, o monumento junto à Árvore Lunar tornou a história da missão espacial um ponto de interesse educativo e turístico no parque.

Fontes candidatas: S22, S21. Fotografias ainda necessárias: Fotos de construção e outras vistas de 2018.

### H07 — Pórtico das Nações

Situação: **rascunho documental**. ID individual localizado; retrospectiva de 2008 em rede social não teve conteúdo revalidado. Marco2008 permanece pendente.

Referência editorial fornecida (não publicação independente): Marco de identificação do espaço das etnias, aparece na retrospectiva oficial das melhorias da Fenasoja de 2008. Materializa a presença cultural das comunidades no parque.

Fontes candidatas: S32. Fotografias ainda necessárias: Fotografia do pórtico de 2008 e sua configuração atual.

### H12 — Casa da Etnia Portuguesa — pedra fundamental

Situação: **rascunho**. O ID é área destinada à etnia, não casa concluída. Fonte2026 registra pedra fundamental e captação futura para construção.

Referência editorial fornecida (não publicação independente): Em maio de 2026 foi lançada a pedra fundamental da futura casa portuguesa, ao lado do espaço da etnia africana. O registro marca o início do projeto de uma sede própria.

Fontes candidatas: S11. Fotografias ainda necessárias: Comprovação atual da obra e, quando houver, da conclusão.

### H13 — Monumento ao Trabalho Voluntário

Situação: **rascunho**. ID cartográfico Monumento do Voluntariado retirado do payload2026.4. Vínculo ao monumento2006 e permanência física precisam de prova.

Referência editorial fornecida (não publicação independente): A retrospectiva oficial de 2006 registra a inauguração de um monumento ao trabalho voluntário, reconhecendo a mobilização comunitária que sustenta a realização da Fenasoja.

Fontes candidatas: S27. Fotografias ainda necessárias: Foto de 2006, inscrição e localização atual.

### H17 — Pavilhão de Remates

Situação: **rascunho**. Programação2014 menciona Pavilhão de Remates. Não existe entidade com esse nome; B9/Pavilhões6,10,11 e PAVILHAO-09 não foram associados por suposição.

Referência editorial fornecida (não publicação independente): Registrado na programação histórica como local de atividades e provas com equinos, integra a infraestrutura associada à tradição pecuária da Fenasoja.

Fontes candidatas: S28. Fotografias ainda necessárias: Interior e exterior históricos, além de foto atual que confirme o prédio.

### H20 — Acesso e pórtico da Exporural

Situação: **rascunho**. Fonte oficial confirma acesso e pórtico Exporural2016, mas não há ID específico demonstrado no traçado atual. Não equivale automaticamente aos portões A6/A7/A8/A9/A11.

Referência editorial fornecida (não publicação independente): O acesso e o pórtico da Exporural foram inaugurados em 2016, entre as melhorias associadas aos 50 anos da Fenasoja.

Fontes candidatas: S13. Fotografias ainda necessárias: Foto da inauguração de 2016 e do acesso atual.

### H21 — Praça Raízes da Terra

Situação: **incorporado a P07**. parentHistoryId=P07. Praça externa documentada na reforma2026 é conteúdo do conjunto do pavilhão. Não foi criada uma praça selecionável adicional.

Referência editorial fornecida (não publicação independente): A praça foi criada junto à reforma do Pavilhão da Agroindústria Familiar em 2026, deixando uma área externa de convivência para a comunidade.

Fontes candidatas: S04. Fotografias ainda necessárias: Fotografia identificada do conjunto da praça e sua placa.

### H25 — Restaurante Fenasoja

Situação: **rascunho**. Fonte2024 descreve Restaurante Fenasoja também como centro de eventos. Cadastro contém C1 Centro de Eventos e C2 Restaurante Central com volumes distintos. Fato2024 não atribuído a nenhum deles sem prova; H26 publica só uso2026 de C1.

Referência editorial fornecida (não publicação independente): A nova estrutura foi inaugurada em dezembro de 2024, qualificando a alimentação e a realização de encontros no parque.

Fontes candidatas: S03. Fotografias ainda necessárias: Fotografias do antigo restaurante, da obra e do novo salão.

### H31 — Ambulatório Médico

Situação: **fora da cena**. Texto do ambulatório2024 confirmado em S03; B23 retirado por NON_PERMANENT_REMOVED_IDENTIFIERS_2026. A funcionalidade não reintroduz esse volume.

Referência editorial fornecida (não publicação independente): Inaugurado em dezembro de 2024, ampliou a estrutura de atendimento à saúde dos visitantes e expositores da feira.

Fontes candidatas: S03. Fotografias ainda necessárias: Fachada completa e vista interna autorizada sem exposição de atendimentos.

### H32 — Parquinho do Sojinha

Situação: **fora da cena**. B18 Parque Infantil Sojinha retirado por NON_PERMANENT_REMOVED_IDENTIFIERS_2026. Não equivale a J, o parque de diversões.

Referência editorial fornecida (não publicação independente): Instalado em outubro de 2024 perto do Portão 3, o parquinho resultou de uma parceria da Fenasoja com apoiadores e deixou uma opção de lazer gratuito para as crianças.

Fontes candidatas: S09. Fotografias ainda necessárias: Registro atual que confirme conservação e eventuais mudanças.

### H33 — Catavento junto à churrascaria

Situação: **rascunho**. Catavento não é entidade semântica própria cadastrada; divulgação2026 não documenta autoria ou implantação.

Referência editorial fornecida (não publicação independente): Referência visual citada na divulgação gastronômica da Fenasoja em 2026. Sua origem, autoria e data de instalação ainda precisam ser documentadas.

Fontes candidatas: S26. Fotografias ainda necessárias: Foto integral do catavento e fonte histórica de instalação.

### H34 — Alameda Fenasoja 50 Anos

Situação: **rascunho**. Alameda Fenasoja50Anos2016 não foi identificada por ID ou percurso. D1 é Alameda Gastronômica, já citada na retrospectiva2004; não são aliases comprovados.

Referência editorial fornecida (não publicação independente): Inaugurada em 2016, a alameda transformou uma antiga área de estacionamento em espaço de exposição, integrando as melhorias do cinquentenário da feira.

Fontes candidatas: S13. Fotografias ainda necessárias: Antes e depois de 2016 e identificação da alameda atual.

### H35 — Blocos sanitários e acessibilidade

Situação: **conjunto em rascunho**. Blocos E-01 a E-26 retirados da cena2026.4. Não há datas individuais; nenhum marco genérico foi replicado nos sanitários.

Referência editorial fornecida (não publicação independente): Reformas e ampliações sucessivas dos sanitários e acessos acompanharam a evolução da infraestrutura de acolhimento do parque.

Fontes candidatas: S13. Fotografias ainda necessárias: Fotos e identificação individual de cada bloco; datas específicas de obras.

### H36 — Sede administrativa / Comissão Central

Situação: **rascunho documental**. Sede/Comissão Central identificada pelo cadastro e manual2026. História de implantação e relação com Casa Fenasoja pendentes; não herda H01.

Referência editorial fornecida (não publicação independente): A sede citada no Manual do Expositor integra a organização operacional da Fenasoja. A identificação do prédio e sua relação com a Casa Fenasoja devem ser confirmadas no cadastro.

Fontes candidatas: S29. Fotografias ainda necessárias: Fachada identificada e documentação sobre construção e uso.

### H37 — Conjunto do Parque de Exposições

Situação: **conjunto em rascunho**. Parque como conjunto não tem entidade selecionável única; projectId reference:fenasoja-2026 identifica projeto, não prédio. Não replicar história geral em cada edifício.

Referência editorial fornecida (não publicação independente): O parque reúne pavilhões, áreas culturais e espaços de convivência que recebem a Fenasoja e outros eventos de Santa Rosa. Seu patrimônio resulta de sucessivas melhorias.

Fontes candidatas: S14, S02. Fotografias ainda necessárias: Panoramas de época com legenda, data e identificação dos edifícios.

### P01 — Pavilhão 1

Situação: **rascunho documental**. Pavilhão1 identificado; história individual, implantação e fotos pendentes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P02 — Pavilhão 2

Situação: **rascunho**. Nenhum Pavilhão2 identificado no cadastro. B2 é Pavilhão14; não usar a numeração do código B como número do pavilhão.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P03 — Pavilhão 3

Situação: **rascunho documental**. Pavilhão3 identificado; história individual, implantação e fotos pendentes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P04 — Pavilhão 4

Situação: **remete a H14**. Pavilhão4 e Cozinha da Soja compartilham B7. Uma história publicada (H14), sem ficha concorrente.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P05 — Pavilhão 5

Situação: **rascunho documental**. Pavilhão5 Veterinária/Pequenos Animais/Rações identificado. História individual pendente.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P06 — Pavilhão 6

Situação: **conjunto em rascunho**. Cadastro agrupa Pavilhões6,10e11 em B9. Não há três IDs individuais; nenhuma história copiada para os meshes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P08 — Pavilhão 8

Situação: **rascunho documental**. Pavilhão8 identificado; história individual, implantação e fotos pendentes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P09 — Pavilhão 9

Situação: **rascunho documental**. Pavilhão9 tem ID próprio. Não foi confundido com pavilhão de remates nem com B9.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P10 — Pavilhão 10

Situação: **conjunto em rascunho**. Mesmo conjunto de P06/P11; sem ID individual e sem data de construção documentada.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P11 — Pavilhão 11

Situação: **conjunto em rascunho**. Mesmo conjunto de P06/P10; sem ID individual e sem data de construção documentada.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P12 — Pavilhão 12

Situação: **rascunho documental**. Pavilhão12 identificado; história individual, implantação e fotos pendentes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

### P13 — Pavilhão 13

Situação: **rascunho documental**. Pavilhão13 identificado; história individual, implantação e fotos pendentes.

Referência editorial fornecida (não publicação independente): Ficha reservada; faltam identificação documental e história individual.

Fontes candidatas: S14. Fotografias ainda necessárias: Fotografia individual atual para identificação; foto antiga e data de construção.

## Inventário completo das entidades não vendáveis

“Mantida” indica presença no payload atual; não certifica permanência arquitetônica, origem histórica ou licença de fotografias. “Fora da pesquisa” indica que não há ficha Hxx/Pxx fornecida. A evidência cartográfica é o cadastro oficial executado; documentação histórica adicional continua necessária para as entidades sem publicação.

| Código | ID real da referência | Nome cadastral | Classe | Cena / cobertura editorial |
|---|---|---|---|---|
| EXPORURAL | reference:2026:exporural | Exporural | RURAL_EXHIBITION | Mantida; publicada H19 |
| QUADRA-S | reference:2026:quadra-s | Quadra S | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-R | reference:2026:quadra-r | Quadra R | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-V | reference:2026:quadra-v | Quadra V | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-Q | reference:2026:quadra-q | Quadra Q | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-N | reference:2026:quadra-n | Quadra N | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-U | reference:2026:quadra-u | Quadra U | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-P | reference:2026:quadra-p | Quadra P | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-M | reference:2026:quadra-m | Quadra M | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-G | reference:2026:quadra-g | Quadra G | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-T | reference:2026:quadra-t | Quadra T | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-O | reference:2026:quadra-o | Quadra O | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-L | reference:2026:quadra-l | Quadra L | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-F | reference:2026:quadra-f | Quadra F | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-J | reference:2026:quadra-j | Quadra J | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-E | reference:2026:quadra-e | Quadra E | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-C | reference:2026:quadra-c | Quadra C | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-I | reference:2026:quadra-i | Quadra I | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-D | reference:2026:quadra-d | Quadra D | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-B | reference:2026:quadra-b | Quadra B | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-A | reference:2026:quadra-a | Quadra A | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| QUADRA-X | reference:2026:quadra-x | Quadra X | QUADRA | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-BRUNO-SCHWARTZ | reference:2026:rua-bruno-schwartz | Rua Bruno Schwartz | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-JOHAN-MULLER | reference:2026:rua-johan-muller | Rua Johan Muller | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-GUSTAVO-BESSEL | reference:2026:rua-gustavo-bessel | Rua Gustavo Bessel | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-EMANUEL-BRACHMANN | reference:2026:rua-emanuel-brachmann | Rua Emanuel Brachmann | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-PASTOR-ALBERT-LEHENBAUER | reference:2026:rua-pastor-albert-lehenbauer | Rua Pastor Albert Lehenbauer | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-15-NOVEMBRO | reference:2026:rua-15-novembro | Rua 15 de Novembro | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-UBIRETAMA | reference:2026:rua-ubiretama | Rua Ubiretama | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-BUENOS-AIRES | reference:2026:rua-buenos-aires | Rua Buenos Aires | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-PARAGUAI | reference:2026:rua-paraguai | Rua Paraguai | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-BOLIVIA | reference:2026:rua-bolivia | Rua Bolívia | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-CHILE | reference:2026:rua-chile | Rua Chile | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-BRASIL | reference:2026:rua-brasil | Rua Brasil | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-URUGUAI | reference:2026:rua-uruguai | Rua Uruguai | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-ARGENTINA | reference:2026:rua-argentina | Rua Argentina | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-BRASILIA | reference:2026:rua-brasilia | Rua Brasília | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-MONTEVIDEU | reference:2026:rua-montevideu | Rua Montevidéu | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-URUGUAI-LESTE | reference:2026:rua-uruguai-leste | Rua Uruguai (trecho leste) | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-ARGENTINA-LESTE | reference:2026:rua-argentina-leste | Rua Argentina (trecho leste) | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-MONTEVIDEU-SUL | reference:2026:rua-montevideu-sul | Rua Montevidéu (trecho sul) | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-INTERNA-OESTE | reference:2026:rua-interna-oeste | Rua Interna Oeste | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-INTERNA-QUADRA-G | reference:2026:rua-interna-quadra-g | Rua Interna da Quadra G | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-INTERNA-QUADRA-T | reference:2026:rua-interna-quadra-t | Rua Interna das Quadras V, U e T | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-LESTE-EXPORURAL | reference:2026:rua-leste-exporural | Rua Leste da Exporural | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RUA-UBIRETAMA-LATERAL-R55 | reference:2026:rua-ubiretama-lateral-r55 | Rua Ubiretama (lateral do Q-R-55) | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| ALAMEDA-MERCOSUL | reference:2026:alameda-mercosul | Alameda Mercosul | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| CALCADA-ARVOREDO | reference:2026:calcada-arvoredo | Calçada do Arvoredo | PEDESTRIAN_PATH | Mantida; fora da pesquisa — conteúdo pendente |
| AV-BENVENUTO-CONTI | reference:2026:av-benvenuto-conti | Avenida Benvenuto de Conti | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| AV-IMIGRANTES | reference:2026:av-imigrantes | Avenida dos Imigrantes | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| AV-TUPARENDI | reference:2026:av-tuparendi | Avenida Tuparendi | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| RODOVIA-RS-472 | reference:2026:rodovia-rs-472 | Rodovia RS 472 | ROAD | Mantida; fora da pesquisa — conteúdo pendente |
| A1 | reference:2026:a1 | Portão 1 — entrada de veículos de visitantes e expositores | GATE | Mantida; publicada H30 |
| A2 | reference:2026:a2 | Portão 2 — entrada e saída de visitantes | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A3 | reference:2026:a3 | Portão 3 — entrada de veículos de expositores e visitantes | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A4 | reference:2026:a4 | Portão 4 — entrada e saída de visitantes | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A5 | reference:2026:a5 | Portão 5 — saída de veículos de expositores e visitantes | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A6 | reference:2026:a6 | Portão 6 — entrada e saída de veículos de visitantes e expositores | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A7 | reference:2026:a7 | Portão 7 — entrada de visitantes e expositores | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A8 | reference:2026:a8 | Portão 8 — entrada de visitantes e expositores | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A9 | reference:2026:a9 | Portão 9 — saída de visitantes e expositores | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A10 | reference:2026:a10 | Portão 10 — entrada e saída de visitantes | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| A11 | reference:2026:a11 | Portão 11 — entrada e saída de visitantes e expositores | GATE | Mantida; fora da pesquisa — conteúdo pendente |
| B1 | reference:2026:b1 | Pavilhão 1 — Indústria, Comércio e Serviços | PAVILION | Mantida; P01 — pendente |
| B2 | reference:2026:b2 | Pavilhão 14 — Artesanato e Comércio | PAVILION | Mantida; publicada P14 |
| B3 | reference:2026:b3 | Pavilhão 12 — Indústria, Comércio e Serviços | PAVILION | Mantida; P12 — pendente |
| B4 | reference:2026:b4 | Pavilhão 8 — Indústria e Comércio | PAVILION | Mantida; P08 — pendente |
| B5 | reference:2026:b5 | Pavilhão 13 — Indústria e Comércio | PAVILION | Mantida; P13 — pendente |
| B6 | reference:2026:b6 | Pavilhão 3 — Indústria e Comércio | PAVILION | Mantida; P03 — pendente |
| B7 | reference:2026:b7 | Pavilhão 4 — Cozinha da Soja | PAVILION | Mantida; publicada H14 |
| B8 | reference:2026:b8 | Pavilhão 5 — Veterinária, Pequenos Animais e Rações | PAVILION | Mantida; P05 — pendente |
| B9 | reference:2026:b9 | Pavilhões 6, 10 e 11 — Pecuária | PAVILION | Mantida; P06, P10, P11 — pendente |
| B10 | reference:2026:b10 | Pavilhão 7 — Agroindústrias | PAVILION | Mantida; publicada P07 |
| B11 | reference:2026:b11 | Centro administrativo / auditório | ADMINISTRATION | Mantida; publicada H24 |
| B12 | reference:2026:b12 | Sede Fenasoja / Comissão Central | ADMINISTRATION | Mantida; H36 — pendente |
| B13 | reference:2026:b13 | Palco Cultural Lactalis | EVENT_VENUE | Mantida; publicada H23 |
| B14 | reference:2026:b14 | Módulo Fenasoja 60 anos — Prefeitura / Câmara de Vereadores e TV's | BUILDING | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B15 | reference:2026:b15 | Imprensa | SERVICE | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B16 | reference:2026:b16 | Fenasoja Store / Informações | SERVICE | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B17 | reference:2026:b17 | Polícia Civil / Sala Lilás | SECURITY | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B18 | reference:2026:b18 | Parque Infantil Sojinha | ATTRACTION | Retirada2026.4; H32 — pendente |
| B19 | reference:2026:b19 | Brigada Militar | SECURITY | Mantida; fora da pesquisa — conteúdo pendente |
| B20 | reference:2026:b20 | Praça das Nações | ATTRACTION | Mantida; publicada H06 |
| B21 | reference:2026:b21 | 19º RC MEC | BUILDING | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B22 | reference:2026:b22 | Pavilhão Terceira Idade | PAVILION | Mantida; fora da pesquisa — conteúdo pendente |
| B23 | reference:2026:b23 | Ambulatório | EMERGENCY | Retirada2026.4; H31 — pendente |
| B24 | reference:2026:b24 | Corpo de Bombeiros | EMERGENCY | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B25 | reference:2026:b25 | Comissão de Logística | SERVICE | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B26 | reference:2026:b26 | Comissão de Gastronomia | FOOD_AREA | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B27 | reference:2026:b27 | Ketten Bebidas | FOOD_AREA | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B28 | reference:2026:b28 | Espaço do Cooperativismo | BUILDING | Mantida; publicada H15 |
| B29 | reference:2026:b29 | Casa Rotária | BUILDING | Mantida; fora da pesquisa — conteúdo pendente |
| B30 | reference:2026:b30 | Monumento do Voluntariado | LANDMARK | Retirada2026.4; H13 — pendente |
| B31 | reference:2026:b31 | Polícia Penal | SECURITY | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B32 | reference:2026:b32 | Expo BM | SECURITY | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B33 | reference:2026:b33 | ACISAP | BUILDING | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B34 | reference:2026:b34 | Tomelero | BUILDING | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B37 | reference:2026:b37 | Comissão Exporural | ADMINISTRATION | Mantida; fora da pesquisa — conteúdo pendente |
| B38 | reference:2026:b38 | Área de Lazer | ATTRACTION | Mantida; fora da pesquisa — conteúdo pendente |
| B39 | reference:2026:b39 | Caminhos da Soja — Emater / Ascar | ATTRACTION | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B40 | reference:2026:b40 | Espaço Institucional — Emater / Ascar | BUILDING | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| B41 | reference:2026:b41 | Sala de Reuniões Fenasoja | ADMINISTRATION | Mantida; fora da pesquisa — conteúdo pendente |
| B42-01 | reference:2026:b42-01 | Módulo de Informações | SERVICE | Mantida; fora da pesquisa — conteúdo pendente |
| B42-02 | reference:2026:b42-02 | Módulo de Informações | SERVICE | Retirada2026.4; fora da pesquisa — conteúdo pendente |
| C1 | reference:2026:c1 | Centro de Eventos Fenasoja | EVENT_VENUE | Mantida; publicada H26 |
| C2 | reference:2026:c2 | Restaurante Central | RESTAURANT | Mantida; fora da pesquisa — conteúdo pendente |
| C3 | reference:2026:c3 | Pizzaria | RESTAURANT | Mantida; fora da pesquisa — conteúdo pendente |
| C4 | reference:2026:c4 | Churrascaria Exporural | RESTAURANT | Mantida; publicada H27 |
| C5 | reference:2026:c5 | Casa da Etnia Polonesa | BUILDING | Mantida; publicada H10 |
| C6 | reference:2026:c6 | Casa da Etnia Italiana | BUILDING | Mantida; publicada H09 |
| C7 | reference:2026:c7 | Casa da Etnia Afro | BUILDING | Mantida; publicada H11 |
| C8 | reference:2026:c8 | Casa da Etnia Alemã | BUILDING | Mantida; publicada H08 |
| D1 | reference:2026:d1 | Alameda Gastronômica | FOOD_AREA | Mantida; fora da pesquisa — conteúdo pendente |
| D2 | reference:2026:d2 | Via Expressa | ATTRACTION | Mantida; publicada H29 |
| D3 | reference:2026:d3 | Espaço Mirante | ATTRACTION | Mantida; publicada H28 |
| D4 | reference:2026:d4 | Tenda da Pecuária | LIVESTOCK_AREA | Mantida; fora da pesquisa — conteúdo pendente |
| D5 | reference:2026:d5 | Núcleo dos Criadores de Cavalos Crioulos | LIVESTOCK_AREA | Mantida; publicada H16 |
| F | reference:2026:f | Arena Sicredi - Icatu | EVENT_VENUE | Mantida; publicada H22 |
| G | reference:2026:g | Árvore Lunar | LANDMARK | Mantida; publicada H04 |
| J | reference:2026:j | Parque de Diversões | ATTRACTION | Mantida; fora da pesquisa — conteúdo pendente |
| E-01 | reference:2026:e-01 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-02 | reference:2026:e-02 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-03 | reference:2026:e-03 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-04 | reference:2026:e-04 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-05 | reference:2026:e-05 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-06 | reference:2026:e-06 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-07 | reference:2026:e-07 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-08 | reference:2026:e-08 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-09 | reference:2026:e-09 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-10 | reference:2026:e-10 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-11 | reference:2026:e-11 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-12 | reference:2026:e-12 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-13 | reference:2026:e-13 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-14 | reference:2026:e-14 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-15 | reference:2026:e-15 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-16 | reference:2026:e-16 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-17 | reference:2026:e-17 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-18 | reference:2026:e-18 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-19 | reference:2026:e-19 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-20 | reference:2026:e-20 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-21 | reference:2026:e-21 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-22 | reference:2026:e-22 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-23 | reference:2026:e-23 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-24 | reference:2026:e-24 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-25 | reference:2026:e-25 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| E-26 | reference:2026:e-26 | Sanitários | RESTROOM | Retirada2026.4; H35 — pendente |
| PISTA-CAMPEIRA | reference:2026:pista-campeira | Pista Campeira | LIVESTOCK_AREA | Mantida; publicada H18 |
| PAVILHAO-09 | reference:2026:pavilhao-09 | Pavilhão 09 | PAVILION | Mantida; P09 — pendente |
| AREA-MOTORHOME | reference:2026:area-motorhome | Área para Motor Home / Trailer para Expositores | PARKING | Mantida; fora da pesquisa — conteúdo pendente |
| TEST-DRIVE | reference:2026:test-drive | Área de estacionamento de veículos test drive | PARKING | Mantida; fora da pesquisa — conteúdo pendente |
| EST-EXP-VIS | reference:2026:est-exp-vis | Estacionamento de expositores e visitantes | PARKING | Mantida; fora da pesquisa — conteúdo pendente |
| EST-VIS | reference:2026:est-vis | Estacionamento de visitantes | PARKING | Mantida; fora da pesquisa — conteúdo pendente |
| PORTICO-NACOES | reference:2026:portico-nacoes | Pórtico das Nações | LANDMARK | Mantida; H07 — pendente |
| ESPACO-ETNIA-RUSSA | reference:2026:espaco-etnia-russa | Espaço destinado à Etnia Russa | ATTRACTION | Mantida; fora da pesquisa — conteúdo pendente |
| ESPACO-ETNIA-ARABE | reference:2026:espaco-etnia-arabe | Espaço destinado à Etnia Árabe | ATTRACTION | Mantida; fora da pesquisa — conteúdo pendente |
| ESPACO-ETNIA-PORTUGUESA | reference:2026:espaco-etnia-portuguesa | Espaço destinado à Etnia Portuguesa | ATTRACTION | Mantida; H12 — pendente |

## Manutenção e critérios de publicação

Adicionar conteúdo exige registrar fonte do fato, ID exato e data com precisão compatível. Promover uma ficha requer texto verificado, vínculo verificado e publicação explícita; a allowlist de bindings deve corresponder às fichas publicadas. `parentHistoryId` não pode criar ciclos e não deve multiplicar histórias em cada mesh. Fotos candidatas, direitos pendentes e legendas não verificadas permanecem no catálogo documental.

O usuário autorizou o uso das fotografias nesta tarefa (“Sim pode colocar as fotos”). A autorização é declarada pelo usuário e limitada ao projeto; não constitui atribuição inventada de titularidade ou licença aberta. Créditos pessoais não confirmados continuam nulos e separados do acervo institucional. Publicação de notícia não é data da fotografia. Nenhuma fotografia foi gerada com IA.

A primeira estrutura foi B10/P07; após validação do fluxo completo pelo responsável pela integração, o mesmo padrão foi habilitado para as outras20 identidades. Resultados de testes, capturas e medições de interface constam no relatório de validação da entrega; este arquivo documenta a revisão editorial e de identidades.
