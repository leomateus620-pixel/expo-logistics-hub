# Inscrição horizontal FENASOJA em relevo na cobertura da arena

Base: `4294ddbb52f84c6784d4e2eb0ed890cf667a2eaf` (origin/main no início do trabalho).

## Marca e implantação

- O símbolo é o arquivo existente `public/alvorada/fenasoja-symbol-official.png`, documentado em `public/alvorada/ATTRIBUTION.md` e `reference-assets.json`. Não houve redesenho, recorte, recoloração ou uso dos anexos como textura.
- O nome usa Inter peso 900 e tracking -0,04 em, conforme `FenasojaBrand.tsx`, `tailwind.config.ts` e a fonte Inter carregada pelo sistema. O subset vetorial de 3 KB conserva os contornos e incorpora o espaçamento em `public/alvorada/fenasoja-wordmark.typeface.json`; a fonte original, licença e conversão estão documentadas em `public/alvorada/ATTRIBUTION.md`. Não se apresenta essa tipografia de interface como um arquivo vetorial institucional fornecido separadamente.
- A composição fica deitada ao longo da cumeeira e ocupa 88% do comprimento da arena. Símbolo à esquerda (22% da composição), intervalo de 5% e nome à direita (73%), todos centralizados na mesma linha. A rotação de 90° é aplicada antes de conformar os vértices ao telhado. O relevo é 2% da largura, com chanfro de 0,065% e assentamento de 0,3%. A altura das letras recebe compensação óptica de 10% para a vista inclinada da referência; o teste também garante folga entre os chanfros de cada par de letras.
- Cada vértice acompanha a elipse da cobertura. A triangulação é subdividida apenas no eixo curvo, para que o interior das faces também fique acima do telhado. As normais são transformadas pela derivada da curva, mantendo iluminação coerente. A implantação deriva de `ARENA_CANONICAL_LAYOUT`, no mesmo grupo e rotação da arena.
- A cobertura, a placa ARENA SICREDI ICATU, os acessos, a entidade F e os dados comerciais permanecem inalterados. As dimensões da arena continuam sendo estimativas registradas a partir de referências, não levantamento nem projeto estrutural executivo.

## Renderização

- Três meshes/draws principais para o conjunto completo: faces das letras, laterais do relevo e símbolo. Sombras usam as luzes já existentes. Nenhuma luz dinâmica, pós-processamento, Canvas, câmera ou controle adicional.
- Materiais compartilhados entre as letras. Fonte e imagem aproveitam o cache do loader. Somente a cópia da textura pertencente à inscrição é liberada no desmontar.
- Mipmaps, anisotropia limitada à capacidade da GPU, recorte alpha com depth-write e geometria estável em todas as distâncias. A face do símbolo mantém o RGB original com material sem interferência da luz/reflexos da cena; seu relevo ainda usa iluminação e sombras. Isso evita a aparência lavada da marca e mantém suas cores vivas em dia e noite.
- As faces usam um acabamento prata com graduação neutra por vértice, da parte inferior cinza à borda superior branca, e laterais cinza metálico `#767e84`. A extrusão e as sombras existentes completam o contraste e a profundidade. A noite reutiliza um material branco emissivo próprio, sem a graduação diurna; os dois materiais são alocados uma vez, compartilhados por todas as letras e liberados ao desmontar. Não há pigmento azul ou preto aplicado às letras, nem textura nova para o acabamento.
- Durante o dia, as faces recebem emissão branca suave de 0,1 e as laterais de 0,025. À noite, as intensidades são 0,65 e 0,08, respectivamente. A emissão é do próprio material e não projeta luz adicional sobre a arena.
- A inscrição permanece única e fixa sobre a cobertura; não gira nem muda de escala conforme a câmera. A leitura principal é aérea e inclinada. Em vistas rasantes, a curvatura do próprio telhado oculta naturalmente partes da escrita. Não há placa vertical, pedestal ou estrutura aérea de fixação.

## Reprodução

Executar Vite em `127.0.0.1:4186` e `node scripts/arena-sign-qa.cjs after`, depois `node scripts/arena-sign-qa.cjs after --mobile`. O runner usa a rota de diagnóstico existente e o Chrome local (`PLAYWRIGHT_MODULE` pode indicar a instalação do Playwright). Não acessa nem modifica dados do banco.

As capturas usam o mesmo Canvas e a mesma cena do mapa. Somente os painéis de diagnóstico são ocultados. Desktop: 1440 × 900; mobile emulado: 390 × 844, DPR do dispositivo 1; durante a medição de navegação o renderer usa DPR 0,9. A distância mobile é ajustada pelo mesmo fator antes/depois para enquadrar a arena no formato retrato. O ensaio final fixa qualidade HIGH e aguarda o pipeline `post` aquecer antes de medir.

## Validação

| Verificação local | Resultado |
| --- | --- |
| TypeScript, ESLint dos arquivos alterados, build Vite | Passaram |
| 10 arquivos de testes selecionados | 111 passaram; 2 falhas anteriores à mudança |
| 6 testes novos de geometria e tipografia | Assentamento/centroides, escala, posição lado a lado, tipografia, folga entre chanfros, orçamento e descarte |
| 9 vistas × dia/noite × desktop/mobile emulado | Inclui vista orientada como o anexo; capturas e resultados da rodada atual abaixo |
| Alternância dia/noite e distâncias | Sem crescimento de geometrias, texturas ou programas após aquecimento |
| Perda/restauração WebGL intencional | Passou em ambos; 1 Canvas, 1 renderer e 1 controle preservados |

As duas falhas preexistentes foram reproduzidas sem a implementação: `commercialMapArenaCanonical.test.ts` espera 1692 entidades e encontra 1578; `commercialMapRuntimeStability.test.ts` exige a string histórica `setEditingLot(false);` no painel. O segundo teste e o painel são idênticos entre a base desta branch e o main local onde foi reproduzido. Nenhum snapshot ou painel foi alterado para mascarar essas divergências. Resultados em [tests.json](tests.json) e [baseline-runtime-tests.json](baseline-runtime-tests.json).

O CI espacial também possui duas falhas anteriores, em `commercialMapSpatialBounds` e `commercialMapRearRoadTreeClearance`: [execução da PR anterior incorporada à base](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36553682105) e [primeira execução desta PR](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36562525427) registram os mesmos 146 testes aprovados e 2 falhos. Esse resultado é separado dos 113 testes locais selecionados acima.

O CI da revisão anterior `59a50660` terminou: `public-map`, `architecture` e `visual (mobile)` passaram; `contracts`, `spatial` e as três execuções territoriais falharam. `visual (wide)` e `visual (desktop)` também falharam por espera de hidratação/captura no runner de software. Essas limitações remotas não são substituídas pelo sucesso das capturas locais com GPU. Consultar o head atual da PR para o estado remoto após esta revisão.

### Desempenho observado

Chrome 154, Windows, Intel UHD/D3D11, três janelas por cenário. Valores abaixo são a mediana das médias de intervalo entre frames, não tempo exclusivo de GPU. O A/B oculta somente a inscrição na mesma cena, mantendo câmera, qualidade, programas aquecidos e pipeline.

| Viewport | Sem inscrição (A/B) | Com inscrição | Diferença |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | 32,96 ms | 33,04 ms | +0,08 ms na mediana; ver pico abaixo |
| Mobile emulado 390 × 844 | 16,6659 ms | 16,6657 ms | Dentro da variação de medição |

O conjunto possui **3 meshes/draws principais e 9.594 triângulos**, contados diretamente nas geometrias (2.764 faces, 5.966 laterais/base e 864 símbolo) e confirmados pelo A/B mobile. No desktop, as médias com inscrição foram 41,83 / 33,04 / 32,90 ms; sem inscrição, 32,52 / 32,96 / 32,97 ms. A primeira janela contém um pico: p95 de 35,2 ms com média de 41,83 ms. A origem desse pico não foi isolada, por isso o relatório conserva essa amostra e não afirma ausência absoluta de engasgos. O contador global desktop também variou em um mesh de 240 triângulos da cena durante o A/B; a contagem do conjunto é a inspeção direta das três geometrias.

Esses ensaios curtos em equipamento compartilhado não isolam o custo de GPU nem sustentam uma promessa de ganho, custo zero ou 60 FPS. A rodada antes da implementação mediu 28,84 ms no desktop e 16,67 ms no mobile emulado; a comparação controlada mais próxima é o A/B da rodada final acima. Os contadores estabilizados tiveram crescimento 0/0/0 em geometrias/texturas/programas nos dois viewports.

O [resumo dos relatórios](summary.json) conserva métricas, câmeras, GPU, estado do renderer, recuperação e SHA-256 dos relatórios locais completos. O runner regenera os relatórios completos `report.json` junto das capturas. Dispositivos móveis físicos e produção não foram validados por esses ensaios locais.

### Evidências visuais

| Vista | Dia | Noite |
| --- | --- | --- |
| Orientação do anexo | [Imagem](after-desktop/day-reference.jpg) | [Imagem](after-desktop/night-reference.jpg) |
| Orientação do anexo em mobile | [Imagem](after-mobile/day-reference.jpg) | [Imagem](after-mobile/night-reference.jpg) |
| Desktop inclinado | [Imagem](after-desktop/day-oblique.jpg) | [Imagem](after-desktop/night-oblique.jpg) |
| Desktop aéreo | [Imagem](after-desktop/day-aerial.jpg) | [Imagem](after-desktop/night-aerial.jpg) |
| Mobile inclinado | [Imagem](after-mobile/day-oblique.jpg) | [Imagem](after-mobile/night-oblique.jpg) |
| Mobile aéreo | [Imagem](after-mobile/day-aerial.jpg) | [Imagem](after-mobile/night-aerial.jpg) |

As pastas `after-desktop` e `after-mobile` incluem também frontal, posterior, laterais, aproximação, visão geral e recuperação. Uma inscrição horizontal fixa aparece invertida na vista posterior e é parcialmente ocultada pela própria curva em ângulos rasantes; não há duplicação ou rotação artificial da escrita. O arquivo oficial mantém SHA-256 `A5F4F07C0231DBDF660E415CCE6A497E78E31E38D19BE8A73A36B486667DDC73`.
