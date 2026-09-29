# Inscrição horizontal FENASOJA em relevo na cobertura da arena

Base: `4294ddbb52f84c6784d4e2eb0ed890cf667a2eaf` (origin/main no início do trabalho).

## Marca e implantação

- O símbolo é o arquivo existente `public/alvorada/fenasoja-symbol-official.png`, documentado em `public/alvorada/ATTRIBUTION.md` e `reference-assets.json`. Não houve redesenho, recorte, recoloração ou uso dos anexos como textura.
- A fonte robusta reutiliza `public/alvorada/helvetiker-bold.typeface.json`, já usada pela experiência FENASOJA. As letras são geometria extrudada com chanfro; a marca mantém a proporção quadrada do arquivo oficial.
- A escrita fica deitada sobre a cobertura e ocupa 88% da largura da arena. O símbolo oficial fica centralizado acima do nome na composição da superfície. O relevo é 1,4% da largura, com chanfro de 0,2% e assentamento de 0,3%.
- Cada vértice acompanha a elipse da cobertura. A triangulação é subdividida apenas no eixo curvo, para que o interior das faces também fique acima do telhado. As normais são transformadas pela derivada da curva, mantendo iluminação coerente. A implantação deriva de `ARENA_CANONICAL_LAYOUT`, no mesmo grupo e rotação da arena.
- A cobertura, a placa ARENA SICREDI ICATU, os acessos, a entidade F e os dados comerciais permanecem inalterados. As dimensões da arena continuam sendo estimativas registradas a partir de referências, não levantamento nem projeto estrutural executivo.

## Renderização

- Três meshes/draws principais para o conjunto completo: faces das letras, laterais do relevo e símbolo. Sombras usam as luzes já existentes. Nenhuma luz dinâmica, pós-processamento, Canvas, câmera ou controle adicional.
- Materiais compartilhados entre as letras. Fonte e imagem aproveitam o cache do loader. Somente a cópia da textura pertencente à inscrição é liberada no desmontar.
- Mipmaps, anisotropia limitada à capacidade da GPU, recorte alpha com depth-write e geometria estável em todas as distâncias. Emissão noturna moderada nas faces e menor nas laterais; a emissão do símbolo usa a própria textura RGB.
- As letras usam azul profundo durante o dia para contrastar com a cobertura clara e emissão branca suave à noite. As cores do símbolo vêm diretamente da imagem oficial, sem tintura.
- A inscrição permanece única e fixa sobre a cobertura; não gira nem muda de escala conforme a câmera. A leitura principal é aérea e inclinada. Em vistas rasantes, a curvatura do próprio telhado oculta naturalmente partes da escrita. Não há placa vertical, pedestal ou estrutura aérea de fixação.

## Reprodução

Executar Vite em `127.0.0.1:4186` e `node scripts/arena-sign-qa.cjs after`, depois `node scripts/arena-sign-qa.cjs after --mobile`. O runner usa a rota de diagnóstico existente e o Chrome local (`PLAYWRIGHT_MODULE` pode indicar a instalação do Playwright). Não acessa nem modifica dados do banco.

As capturas usam o mesmo Canvas e a mesma cena do mapa. Somente os painéis de diagnóstico são ocultados. Desktop: 1440 × 900; mobile emulado: 390 × 844, DPR do dispositivo 1; durante a medição de navegação o renderer usa DPR 0,9. A distância mobile é ajustada pelo mesmo fator antes/depois para enquadrar a arena no formato retrato. O ensaio final fixa qualidade HIGH e aguarda o pipeline `post` aquecer antes de medir.

## Validação

| Verificação local | Resultado |
| --- | --- |
| TypeScript, ESLint dos arquivos alterados, build Vite | Passaram |
| 10 arquivos de testes selecionados | 109 passaram; 2 falhas anteriores à mudança |
| 4 testes novos de geometria | Passaram: assentamento/centroides, escala, logo, orçamento e descarte |
| 8 vistas × dia/noite × desktop/mobile emulado | 32 capturas; nenhum erro JS ou overflow |
| Alternância dia/noite e distâncias | Sem crescimento de geometrias, texturas ou programas após aquecimento |
| Perda/restauração WebGL intencional | Passou em ambos; 1 Canvas, 1 renderer e 1 controle preservados |

As duas falhas preexistentes foram reproduzidas sem a implementação: `commercialMapArenaCanonical.test.ts` espera 1692 entidades e encontra 1578; `commercialMapRuntimeStability.test.ts` exige a string histórica `setEditingLot(false);` no painel. O segundo teste e o painel são idênticos entre a base desta branch e o main local onde foi reproduzido. Nenhum snapshot ou painel foi alterado para mascarar essas divergências. Resultados em [tests.json](tests.json) e [baseline-runtime-tests.json](baseline-runtime-tests.json).

### Desempenho observado

Chrome 154, Windows, Intel UHD/D3D11, três janelas por cenário. Valores abaixo são a mediana das médias de intervalo entre frames, não tempo exclusivo de GPU. O A/B oculta somente a inscrição na mesma cena, mantendo câmera, qualidade, programas aquecidos e pipeline.

| Viewport | Sem inscrição (A/B) | Com inscrição | Diferença |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | 28,72 ms | 30,17 ms | +1,44 ms / +5,0% |
| Mobile emulado 390 × 844 | 16,6662 ms | 16,6664 ms | Dentro da variação de medição |

O custo geométrico medido é **3 draws e 7.254 triângulos**. Há um pequeno custo de frame no desktop; os resultados não sustentam uma promessa de custo zero ou de 60 FPS nesse equipamento. A rodada antes da implementação mediu 28,84 ms no desktop e 16,67 ms no mobile emulado. Os contadores estabilizados tiveram crescimento 0/0/0 em geometrias/texturas/programas nos dois viewports.

O [resumo dos relatórios](summary.json) conserva métricas, câmeras, GPU, estado do renderer, recuperação e SHA-256 dos relatórios locais completos. O runner regenera os relatórios completos `report.json` junto das capturas. Dispositivos móveis físicos e produção não foram validados por esses ensaios locais.

### Evidências visuais

| Vista | Dia | Noite |
| --- | --- | --- |
| Desktop inclinado | [Imagem](after-desktop/day-oblique.jpg) | [Imagem](after-desktop/night-oblique.jpg) |
| Desktop aéreo | [Imagem](after-desktop/day-aerial.jpg) | [Imagem](after-desktop/night-aerial.jpg) |
| Mobile inclinado | [Imagem](after-mobile/day-oblique.jpg) | [Imagem](after-mobile/night-oblique.jpg) |
| Mobile aéreo | [Imagem](after-mobile/day-aerial.jpg) | [Imagem](after-mobile/night-aerial.jpg) |

As pastas `after-desktop` e `after-mobile` incluem também frontal, posterior, laterais, aproximação, visão geral e recuperação. Uma inscrição horizontal fixa aparece invertida na vista posterior e é parcialmente ocultada pela própria curva em ângulos rasantes; não há duplicação ou rotação artificial da escrita. O arquivo oficial mantém SHA-256 `A5F4F07C0231DBDF660E415CCE6A497E78E31E38D19BE8A73A36B486667DDC73`.
