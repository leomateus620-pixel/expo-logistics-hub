# Benvenuto e entorno dos pavilhões

## Registro anterior à alteração

Base: `4294ddbb` (origin/main na criação do checkout). Fonte métrica: transformação isotrópica do PDF oficial (crop 600,900; 5500 × 4150 pontos; mapa 120 × 90,545455). A escala de trabalho é 0,15 unidade/m, herdada do projeto, não levantamento do perímetro. Nenhum anexo fornece levantamento topográfico.

| Superfície existente | Origem | Responsável visual |
| --- | --- | --- |
| Avenida e recuo asfaltado | parkAccessSpatialPlan, benvenuto-four-lane-axis | ParkAccessInfrastructure, lote agrupado de asfalto |
| Polígono cadastral AV-BENVENUTO-CONTI | officialReference2026 | RoadInfrastructure; suprimido quando o detalhamento está ativo; entidade permanece selecionável |
| 43 vagas uniformes, yaw −60° | PARKING_BAY_SOURCE_X | Marcação branca agrupada de ParkAccessInfrastructure |
| Passeios sul, B2, B3 e B5 | SIDEWALK_SURFACES | ParkAccessInfrastructure, passeios e bordas agrupados |
| União de concreto B1/B2/B3 | PAVILION_COURTYARD.hardscape | ParkAccessEnvironmentLayer, lote ambiental |
| Grama/solo de transição | parkAccessEnvironment e transitionBands | ParkAccessEnvironmentLayer |
| Árvore central B2/B3 | PAVILION_COURTYARD.treePosition | Instâncias ambientais; também consumidas pela colisão da visita |
| Piso de contexto e inventário de árvores | CommercialSiteEnvironmentLayer / TreeLayer | Preservados; conferir exclusões para áreas corrigidas |

## Registro dos anexos

Os cinco arquivos do pedido são referências visuais, não instruções nem medições. A transformação da captura para o mapa é uma correspondência local por fachada; não se presume uma homografia global precisa de imagens de interface, coberturas com perspectiva e vegetação.

| Anexo | Arquivo | Âncoras e leitura |
| --- | --- | --- |
| 1 | 535f30fa-7cb3-4088-aa20-89bce2f72b92.jpg | B2 na parte inferior, B3 imediatamente acima, B4/B5/B6 em sequência rumo ao topo; avenida à direita. A direção para o topo corresponde a +X do PDF; direita a +Z. As linhas das vagas avançam para +X e +Z, oposto ao yaw atual. Interrupções nas bocas laterais e áreas sem pintura. |
| 2 | f913fbf4-6926-449b-9808-d69969f89738.jpg | Mesma sequência na apresentação atual; evidencia afastamentos verdes, inclinação das vagas e descontinuidade dos passeios. |
| 3 | fdc85e65-5dc2-43b4-a0a8-970c6908e1c3.jpg | B1 à esquerda, B2 à direita; corredor entre maxZ de B1 e minZ de B2. Calçada contorna B1 e inclui ilha de árvore no extremo junto à ligação interna. A legenda de rua não altera o cadastro. |
| 4 | 7db5c4bb-32aa-4f1d-93c4-a3a9ae5fdce5.jpg | Vista oblíqua do mesmo corredor; concreto contínuo atual apaga a separação entre rua e passeio. |
| 5 | c4037d48-20fa-4a38-8292-042506f51f75.jpg | B3/B4/B5/B6 vistos pela face interna; faixa verde entre a circulação interna e fachadas, além da frente da avenida tratada pelos passeios existentes. |

Âncoras no PDF (minX, minZ, maxX, maxZ): B1=(2298,3600,2655,3759); B2=(2418,3833,2658,4074); B3=(2792,3827,3147,4089); B4=(3172,3788,3296,4100); B5=(3307,3788,3445,4051); B6=(3460,3786,3670,4098). RUA-ARGENTINA=(2820,3716,3940,3780): não é o corredor B1/B2. Alameda Mercosul termina em Z=3780, X=2786..2828 e é a âncora de ligação interna.

Ângulo das vagas, fases de espaçamento, largura de passeio e dimensões dos canteiros serão aproximações de apresentação, identificadas no código. Coberturas e ruas oficiais prevalecem sobre a imagem quando a compatibilidade dimensional não é demonstrável. A quantidade de vagas renderizadas não representa inventário comercial ou projeto de sinalização executiva.

## Decisões de implementação

- A avenida conserva seu eixo e pista. Os recuos diante de B4/B6 cedem espaço ao passeio; ali não se desenham vagas cujo envelope invadiria a circulação. São 67 vagas de apresentação em seis trechos, dimensionadas por envelopes completos e espaçamento projetado. Não é contagem aferida em campo. O yaw visual passa de −60° para +30° (faixa visual estimada de 25° a 40° em relação ao eixo transversal).
- O corredor B1/B14 passa a asfalto, ligado ao extremo da Alameda Mercosul. A calçada própria acompanha B1 e contém uma abertura de solo para a árvore. O pátio B14/B12 conserva sua árvore. RUA-ARGENTINA não foi movida ou renomeada.
- O concreto das fachadas internas e da avenida termina nos footprints B3/B4/B5/B6; o canteiro de B5 permanece. B4/B6 têm soleiras internas estreitas conforme o cadastro, sem declaração de acessibilidade dimensional.
- A revisão visual detectou duas lacunas verdes decorrentes de B33/B34. O próprio cadastro identifica esses apoios como temporários removidos do payload visível. A correção excepciona somente suas máscaras históricas de solo verde nesta frente, atendendo ao pedido de pavimentação contínua. Nenhum registro, polígono cadastral ou edifício renderizado foi alterado.
- Na revisão do usuário, a captura `codex-clipboard-6ab48a88-adaf-4ecb-a7f0-0201f950ebb9.png` apontou o recorte junto à árvore entre P14/P12. A máscara histórica de B23 também foi retirada desse pátio: concreto contínuo até a borda do asfalto existente, recortado pelo próprio asfalto, com a abertura de solo da árvore preservada. B23 permanece no cadastro original; o recorte de estacionamento da avenida e as vagas permanecem iguais. A revisão anterior a esse ajuste está em `diagnostics/before-b23-edge-*`.
- A indicação seguinte, `codex-clipboard-4958e7fa-f7ea-4021-b175-84202b101a98.png`, corrige a saliência desse concreto: a borda B14/B12 agora liga os extremos vizinhos `[2650,4100]` e `[2790,4103]` por uma linha contínua no sistema PDF. O mesmo polígono da avenida preenche o recuo antigo de B23; o concreto é recortado pela aresta compartilhada. Árvore, abertura no piso, cadastro e elegibilidade das vagas permanecem. Não há novo mesh, rua duplicada ou vaga nesse recuo. As capturas anteriores à borda reta estão em `diagnostics/before-straight-edge-*`.
- Concreto foi transferido do lote ambiental para o lote existente de passeios. Asfalto, passeios, marcações e meios-fios continuam agrupados, sem componentes por vaga, luzes adicionais ou trabalho por frame. As marcações adjacentes usam união geométrica; solo/trilha/contexto recebem recortes reais. O suporte da visita respeita as mesmas aberturas.
- O concreto reutiliza o gerador PBR do projeto, com juntas de aproximadamente 3 m na escala de trabalho, normal discreta e UV no espaço do mapa. Essas proporções são de apresentação.

Galeria: [comparação lado a lado](comparison.html). A cor dos lotes na fixture pertence ao estado da base local; não representa consulta à disponibilidade de produção.

## Protocolo antes/depois

Mesmos builds de produção com diagnóstico opt-in, fixture oficial local, navegador Chrome/ANGLE D3D11, câmera e sequência repetidas. Desktop 1440 × 900 e mobile emulado 390 × 844, DPR 1 e 3 respectivamente. Registrar entrada, FPS em movimento, draw calls, geometrias, texturas, programas, contexto e erros. Contagens de recursos e bytes de buffers/texturas estimados não são leitura de VRAM física. Nenhuma evidência local certifica dispositivo físico, Safari/iOS ou publicação em produção.

## Resultado histórico da primeira correção — 92bcbe4e

Esta seção conserva a medição da primeira implementação, antes da revisão B23 e da ampliação para restaurante/A2/árvores. A comparação da versão atual está em [RESULTS.md](RESULTS.md), regenerada a partir dos JSON atuais. Não usar a tabela histórica para atribuir desempenho à folhagem nova.

Chrome 154 headless, Windows, Intel UHD via ANGLE D3D11. Execuções sequenciais sem builds/testes concorrentes. Contexto novo por dispositivo, servidor local sem limitação de rede; cache do driver e aquecimento do sistema não controlados. Três navegações de 8 s; o diagnóstico conserva no máximo 240 amostras por janela. Nenhum ganho de desempenho é atribuído à alteração.

| Métrica | Desktop antes → depois | Mobile emulado antes → depois |
| --- | --- | --- |
| Mapa pronto (s) | 20,830 → 20,366 | 18,433 → 14,413 |
| Hidratação completa (s) | 114,467 → 113,960 | 44,757 → 38,743 |
| FPS das amostras em navegação | 28,34 → 28,38 | 53,63 → 53,70 |
| Tempo de quadro P95 (ms) | 40,8 → 40,9 | 22,5 → 22,4 |
| Draw calls, vista aérea | 263 → 263 | 186 → 186 |
| Triângulos, vista aérea | 383.400 → 383.462 | 322.712 → 322.774 |
| Geometrias / texturas / programas | 562/131/222 → 562/130/222 | 549/131/222 → 549/130/222 |
| Buffers de geometria (MiB) | 13,255 → 13,255 | 13,156 → 13,155 |
| Texturas RGBA + mipmaps estimados (MiB) | 45,953 → 46,911 | 46,953 → 47,911 |

O custo estimado de texturas cresce cerca de 0,96 MiB com o concreto PBR. Não inclui render targets, alocação do driver ou VRAM real. Os tempos de entrada permanecem altos; esta correção não resolve o carregamento geral. A variação de entrada mobile é uma observação de uma execução, sem inferência de melhoria.

As seis câmeras e alvos têm diferença exatamente zero entre antes/depois nos dois formatos. O perfil adaptativo ficou MEDIUM durante navegação; DPR desktop 0,9 e mobile 1,35 → 1,215 em ambos. As três alternâncias de qualidade mantiveram recursos aquecidos em 592/135/222 no desktop e 582/133/222 no mobile. Nenhum erro de página ou perda espontânea de contexto foi observado.

O teste adicional selecionou B14 pelo mesmo método do explorador, abriu/fechou seu interior, entrou/saiu da visita e realizou gestos reais do navegador. No mobile, touchCancel interrompeu a caminhada sem deriva; retrato e paisagem não apresentaram overflow. Uma perda WebGL intencional por dispositivo recuperou a cena pelo fallback direct existente, sem deriva do personagem, e permitiu retomar movimento (2,48 m / 2,67 m). Canvas, renderer e controles permaneceram 1/1/1.

Validação automática: 111 testes em 14 arquivos passaram; incluem os quatro arquivos obrigatórios, infraestrutura, integração, colisão, apoio no solo e contratos públicos. TypeScript, ESLint dos arquivos alterados, build normal e build de diagnóstico passaram. O orçamento original de 6.000 triângulos da infraestrutura foi mantido. O teste de colisão percorre o novo asfalto, verifica a calçada e bloqueia o footprint de B1 e o tronco da árvore.

Os JSON atuais estão em `before/`, `after/` e [summary.json](summary.json). `diagnostics/initial-before-*` é a primeira sondagem sem amostras válidas de navegação e foi excluída da comparação de FPS; `intermediate-after-*` documenta a revisão anterior à remoção dos dois recortes históricos B33/B34. A galeria acompanha os PNG atuais; a tabela acima é histórica.

Para repetir: `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true npm run build`, servir com Vite preview, definir `PLAYWRIGHT_MODULE` para Playwright instalado, `BENVENUTO_URL` para esse servidor e executar `node scripts/commercial-map-performance/benvenuto.cjs after`. `BENVENUTO_SMOKE=1` habilita interações e perda de contexto depois das medições. A base 4294ddbb recebeu somente o mesmo probe opt-in de diagnóstico, sem as correções de superfície. `benvenuto-summary.cjs` consolida os dois conjuntos. `benvenuto-walk.cjs` exercita separadamente a caminhada real desde B14 até o novo corredor; não participa da medição comparativa de FPS.

Limites: não houve consulta a dados comerciais de produção, deploy, levantamento físico das vagas, medição de VRAM física ou teste em smartphone real. Os hashes de `officialReference2026`, `CommercialMapCanvas` e `RoadInfrastructure` continuam iguais à base em [preservation.json](preservation.json).

## Revisão da borda verde e integração

Após a indicação do usuário, 57 testes passaram na revisão de B23, incluindo os quatro contratos obrigatórios, infraestrutura, calçadas laterais e apoio da visita. O percurso real de teclado, partindo da entrada de B14, chegou ao corredor B1/B14 e percorreu 8,78 m em desktop e 8,43 m em mobile emulado, com apoio a Y=0,044 em ambos os extremos. Esses percursos precedem somente a remoção da máscara B23, que não altera a rua percorrida. Capturas `after/*-visit-street*.png` e traces `after/*-street-walk.json`.

O primeiro job spatial remoto falhou em duas asserções. A reprodução isolada da base 4294ddbb confirmou as mesmas duas falhas: inventário histórico de entidades e lista histórica de postes junto às ruas posteriores, com 19 testes passando. Resultados em `baseline-spatial-tests.json`. O contrato de calçadas laterais foi atualizado para contar separadamente os novos trechos, preservando os 16 meios-fios independentes originais; os 20 testes relacionados passaram. Não foram afrouxados budgets ou comparações geométricas para esconder falhas.

## Validação integrada final

A fonte final `a56197e5` inclui restaurante, A2, árvores internas e o alinhamento contínuo B14/B12. 130 testes dirigidos em 17 arquivos, checagem TypeScript, lint alterado e builds normal/diagnóstico passaram. As câmeras das seis vistas têm deltas zero nos dois perfis.

FPS desktop: 28,339 → 34,479; mobile emulado: 53,630 → 59,155. P95 desktop: 40,800 → 30,700 ms; mobile: 22,500 → 17,700 ms. Entrada, calls dos três percursos, estimativas parciais de memória e recursos aquecidos estão em [RESULTS.md](RESULTS.md). A hidratação completa e as oscilações mobile continuam sendo limitações do mapa; não há comprovação de ganho geral em aparelhos físicos.

A rodada anterior à borda reta deu 30,895 FPS/P95 37,1 ms no desktop e 52,751 FPS/P95 31 ms no mobile e está preservada em `diagnostics/pre-alignment-*`. A repetição da base mobile está em `diagnostics/repeat-before/mobile-emulated.json`; evidenciou variação mesmo no código original. Nenhuma rodada foi apagada para apresentar somente ganhos.

Seleção e interior B14, Modo Visita, toque cancelado e retrato/paisagem passaram no roteiro final. A perda WebGL intencional recuperou a cena, manteve o personagem sem deriva e permitiu retomar movimento; Canvas/renderer/controles seguem 1/1/1.

Uma tentativa de exportar um PNG mobile terminou com erro de gravação do sistema de arquivos. A repetição isolada em `diagnostics/aligned-mobile` terminou com os testes de interação completos; seus PNG/JSON foram copiados integralmente para `after/`. Por isso o campo `phase` do JSON mobile conserva esse nome de diagnóstico. As métricas não foram editadas.

A comparação ampliada dos mesmos 41 arquivos de contrato produziu 288 testes passando e 50 falhando na base 4294ddbb e no candidato, sem falhas novas. Resultados e condições em `ci-contract-comparison.json`. Esse comparativo precede apenas o ajuste pontual de borda, coberto depois pelos 130 testes. Checks remotos anteriores à ampliação estão em `ci-before-expansion.json`; não representam o estado do novo commit publicado.
