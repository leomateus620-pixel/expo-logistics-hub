# Reconstrução rural, acessos e continuidade do terreno — PR 155

A revisão usa o head original `4f8bdf3777dc521d80ad67885278e79da7426e56` como baseline. Aproveita a reconstrução já iniciada na mesma PR e corrige geometria, implantação, materiais, continuidade de pavimento e terreno. As dimensões são estimativas visuais registradas nos controles existentes, não medidas de levantamento.

## Alterações verificadas

- **Test Drive / Sede Costeiros:** mesmo componente e centro; quatro pilares de varanda, empenas triangulares fechadas, parede longitudinal com aberturas reais, quatro janelas maiores seguidas de três altas na lateral fotografada, alvenaria e telhado com escala de detalhe definida. Fundação embutida no piso existente, sem translação arbitrária.
- **D4 / Tenda da Pecuária:** pavilhão semiaberto, pilares escuros robustos e dois centrais em tijolo, mureta interrompida na entrada, ala fechada à esquerda e passagem à direita. O fundo foi recortado pelo limite de B28 para eliminar a interpenetração; fachada e orientação preservadas. Nome físico aplicado à empena.
- **Rótulas e vias:** centro principal derivado do anel registrado; união de pavimento com furos nas duas ilhas, conexão curva A1/avenida, retirada dos trechos territoriais e pinturas transferidos, passeio fora da ilha e proteção explícita contra limpeza espacial.
- **Estacionamentos das Etnias:** duas placas visuais e saias removidas. Picking/seleção continuam na geometria sem material visível. O terreno traseiro compartilha o material e a fase UV da base; árvores e grama apoiam na superfície real.
- **Pavilhões 1/14/12:** ligação de concreto pelo cap existente do bosque, pátio contínuo com abertura de raiz e uma árvore instanciada, respeitando B23 e vias existentes.
- **Interface:** removido o aviso permanente de perfil de compatibilidade. A qualidade adaptativa e a recuperação de falhas gráficas permanecem funcionais.

## Evidência visual

As câmeras fixas usam a mesma referência local nas duas versões. `baseline` mostra a implementação anterior da PR, que já havia substituído parte dos blocos originais; as fotografias fornecidas orientaram a revisão adicional. Os anexos 7–9 representam Test Drive; 10–11 representam a Pecuária.

| Setor | Antes da revisão | Resultado |
|---|---|---|
| Test Drive | [Frente](baseline/test-drive-front.png), [lateral](baseline/test-drive-side.png), [traseira](baseline/test-drive-rear.png), [oblíqua](baseline/test-drive-oblique.png), [superior](baseline/test-drive-top.png) | [Frente](after/test-drive-front.png), [lateral](after/test-drive-side.png), [traseira](after/test-drive-rear.png), [oblíqua](after/test-drive-oblique.png), [superior](after/test-drive-top.png) |
| Pecuária | [Frente](baseline/pecuaria-front.png), [lateral](baseline/pecuaria-side.png), [oblíqua](baseline/pecuaria-oblique.png) | [Frente](after/pecuaria-front.png), [lateral](after/pecuaria-side.png), [oblíqua](after/pecuaria-oblique.png), [noite](after/pecuaria-night.png) |
| Acessos | [Superior](baseline/access-top.png) | [Conjunto](after/access-top.png), [principal](after/access-main-top.png), [Portão 1](after/gate1-top.png) |
| Estacionamentos | [Superior](baseline/parking-top.png) | [Superior](after/parking-top.png), [oblíqua](after/parking-oblique.png) |
| Caminho/pátio | [Superior](baseline/pavilion-court-top.png) | [Superior](after/pavilion-court-top.png), [oblíqua](after/pavilion-court-oblique.png) |

Capturas móveis e relatório estão em [after-mobile/runtime.json](after-mobile/runtime.json). A inspeção inclui as construções sem labels; seleção, interior B3, rotação, pan e zoom também são exercitados na cena de teste.

## Validação técnica e desempenho

O relatório [verification.json](verification.json) registra os checks e a comparação de tempos, recursos e saúde do renderer. [test-comparison.json](test-comparison.json) discrimina as falhas da suíte anterior e quaisquer diferenças. Os contratos focados cobrem aberturas por raycast, envelopes, não interseção com B28, contato das árvores com o terreno, UV, ownership de materiais, continuidade viária, furos das ilhas e área triangulada sem duplicação.

O conjunto de infraestrutura fica em **5.823 triângulos no perfil completo / 4.665 no reduzido, 12 draws e 3 passes de sombra**, dentro dos limites existentes de 6.000 / 12 / 3. Os dois perfis compartilham a fronteira viária de 48 segmentos para não abrir frestas no recorte territorial. Test Drive permanece abaixo das alocações anteriores de 2.052 / 1.356 triângulos. A empena acrescenta um draw, compensado pela união dos meios-fios. O pátio usa os quatro batches ambientais existentes e menos de 60 triângulos de concreto. A remoção das placas e o compartilhamento dos materiais retiram recursos próprios de terreno e asfalto.

**Checks:** 136/136 testes em 16 suítes focadas; typecheck, ESLint dos arquivos alterados, build e catálogo espacial gerado passaram. A suíte ampla no commit `609db827` passou 1.135/1.193 testes: 58 falhas existentes, nenhuma nova ou alterada, sete falhas do baseline resolvidas. Os ajustes finais de asfalto e fronteira de LOD no commit `728f6fe7` foram verificados novamente pelo gate focado, typecheck/build e capturas completas. A suíte ampla não foi repetida depois desse ajuste localizado.

| Métrica desktop na mesma câmera | Baseline `4f8bdf37` | Revisão `728f6fe7` |
|---|---:|---:|
| Médias de frame das três amostras (ms) | 18,97 / 19,57 / 20,82 | 30,39 / 18,88 / 18,71 |
| Mediana das médias (ms) | 19,57 | 18,88 |
| p95 das três amostras (ms) | 24,30 / 25,20 / 27,10 | 22,40 / 22,50 / 22,60 |
| Draw calls | 275–276 | 272–274 |
| Triângulos desenhados | 486.172–486.184 | 484.880–484.932 |
| Geometrias / texturas GPU | 589 / 150 | 571 / 145 |
| Programas de shader | 212 | 214 |

As três amostras estão preservadas, inclusive a pausa na primeira amostra revisada. A mediana e o p95 melhoraram nesta comparação local, com menos geometrias, texturas e draws; isso não comprova ausência de pausas em outros cenários. Ambos os lados estabilizaram geometrias, texturas e programas nos ciclos finais de dia/noite/economia, com zero erros de página e perdas de contexto. O primeiro ensaio de transição com apenas 1,2 s entre modos reprovou o platô de programas; o diagnóstico ficou registrado em `diagnostics/short-transition-probe.json`. As capturas finais repetem seis ciclos, com 3 s por modo, para observar as variantes de iluminação estabilizadas.

As medições locais usam Chrome/ANGLE em Intel UHD, cena de fixture com o renderer de produção, viewport desktop 1366×900 e móvel 390×844. O DPR real e o caminho de renderização constam em cada amostra. Os tempos descrevem navegação aquecida; não representam carregamento frio, rede de produção, Safari/iPhone físico, Android físico ou comportamento térmico. As capturas finais são executadas sem build/testes concorrentes. A suíte ampla mantém falhas anteriores documentadas; isso não equivale a suíte inteira verde.

## Limites da referência

- `IMG_0956.jpeg` documenta a rótula principal, mas não enquadra integralmente a pequena rótula de A1. Centro e diâmetro desta última continuam os registrados; sua conexão e ausência de sobreposição foram verificadas geometricamente. Não se afirma que o diâmetro foi medido nessa foto.
- A fachada oposta e a traseira do Test Drive não estão integralmente documentadas nas fotos; conservam interpretação compatível com a implantação existente.
- B23 continua no cadastro e é respeitado no pátio. A árvore central é apresentação ambiental, não um novo registro oficial de espécie/indivíduo.
- A borda funcional do terreno da Arena, fora dos dois estacionamentos, foi preservada. As manchas suaves da textura ambiental não são placas cadastrais.

Auditorias: [origens e implantação](spatial-audit.md), [recuo D4/B28](livestock-neighbor-clearance.md), [caminho e pátio](pavilion-courtyard-audit.md).

Reprodução local: `node scripts/rural-capture.cjs after http://127.0.0.1:4189`, com Playwright disponível em `PLAYWRIGHT_MODULE` e Chrome instalado; acrescente `--mobile` para a emulação. O inventário é servido por `/__dev/commercial-map-rendering?quality=fixed`. O workflow territorial captura também três viewports com Chromium/software GPU e conserva seu próprio relatório, sem misturar esses tempos aos de hardware local.
