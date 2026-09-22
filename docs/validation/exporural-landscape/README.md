# Exporural, Sanitários da Soja e Alameda Gastronômica

Base: `2c6d7917`. Validação local em 21/09/2026.

## Resultado visual

| Vista | Antes | Depois |
|---|---|---|
| Zoom médio / divisões | ![](before/medium.png) | ![](final/medium.png) |
| Q-R-02 / poço | ![](before/r2.png) | ![](final/r2.png) |
| Q-R-14 / lateral do Pavilhão 5 | ![](before/r14.png) | ![](final/r14.png) |
| Superior | ![](before/top.png) | ![](final/top.png) |
| Banheiro / fachada | ![](restroom-before/restroomFront.png) | ![](final/restroomFront.png) |
| Banheiro / lateral | ![](restroom-before/restroomSide.png) | ![](final/restroomSide.png) |
| Alameda / fachada | ![](alameda-before/alamedaFront.png) | ![](final/alamedaFront.png) |
| Alameda / fundos | ![](alameda-before/alamedaRear.png) | ![](final/alamedaRear.png) |

As margens acompanham os polígonos cadastrais atuais, com faixa estreita de grama aparada, ombro suave e contraste discreto. O material dos lotes R/S recebe variação fina, mantendo cores de seleção, filtro e status. O indicador de status do Q-R-02 foi deslocado apenas visualmente para não atravessar o cercamento.

O poço é o nó hidráulico existente `well-02`, cuja posição calibrada cai no Q-R-02. A apresentação física usa essa âncora e acrescenta a base, alvenaria, grade, bomba, quadro e poste vistos na foto. Não há poste elétrico cadastrado nessa mesma âncora; o apoio é um detalhe visual do conjunto, sem novos nós, cabos ou conexões presumidas. O símbolo e a seleção da camada hidráulica continuam independentes, e a apresentação física é ocultada durante o modo de infraestrutura.

O talude ocupa **exclusivamente a faixa verde ociosa externa aos lotes**, como uma superfície contínua: começa atrás do Pavilhão 5 (B8), junto ao limite do Q-R-13, contorna a lateral afunilada do Q-R-14, acompanha o recuo verde na frente do pavilhão e conecta-se à faixa entre o limite sul do Q-R-02 e a Rua Paraguai. Nenhum talude eleva a superfície comercial. A divisa compartilhada diretamente entre Q-R-13 e Q-R-14 fica excluída. A face de terra converge suavemente ao gramado, com afastamento mínimo de 0,035 unidade da divisa. A largura varia de 1,60 unidade na lateral ampla do Pavilhão 5 até 0,48 unidade nas faixas estreitas atrás do pavilhão e junto à rua. A geometria de apresentação não constitui levantamento altimétrico e não rebaixa nem recorta os polígonos oficiais; o patamar fica 0,22 unidade acima do pé do talude. Conforme confirmação do solicitante, o Pavilhão 5 está no lado superior: a face marrom sobe uma única vez e termina no patamar verde plano. O preenchimento desse patamar é recortado contra lotes, vias e edifícios; não existe encosta verde descendente do lado do pavilhão. Apenas as extremidades livres convergem suavemente ao terreno existente.

![Continuidade da encosta externa, vista superior](final/connectionTop.png)

![Talude posterior do Pavilhão 5, fora do Q-R-13](final/r13Rear.png)
![Conjunto do Pavilhão 5 e encosta contínua](final/p5Top.png)

## Estruturas acrescentadas ao escopo pelo solicitante

**E-07 — Sanitários da Cozinha da Soja:** paredes cinza mais altas, cobertura inclinada com nervuras, vidros superiores trapezoidais, faixas de blocos de vidro, venezianas e entradas recuadas. Altura visual até o coroamento: 1,20 unidade, antes 0,64. O volume de seleção acompanha a altura visual. Mantidos o footprint, a orientação das entradas, a identidade e os dois caminhos até a via. As medidas são interpretação visual da foto, sem alterar os parâmetros cadastrais.

**D1 — Alameda Gastronômica:** a plataforma anterior tinha topo entre 0,29 e 0,36 e espessura entre 0,10 e 0,13, deixando vazio sob suas laterais. A fundação agora vai até -0,035, com topo entre 0,20 e 0,25, recortada nos acessos. A varanda tem guarda-corpo, escada central de quatro degraus, rampa, cobertura prolongada e pilares apoiados. Frontões fechados, nervuras de cobertura e juntas discretas melhoram a leitura da arquitetura. Os 17 mastros continuam no alinhamento existente, com altura máxima visual entre 1,75 e 1,95 (antes 2,90–3,28) e raio menor. A orientação oficial de D1, seus limites e vias vizinhas permanecem intactos.

## Salvaguardas e evidências

- Inventário completo antes/depois com SHA-256 idêntico: `060d67f464058ccff71441f3960c2d97c1d19fc8f7858a2f7a05937c834e78cf`. Nenhuma migração, preço, área oficial, identificação, classificação, regra de esquina, vínculo ou rota foi alterada.
- Controle exterior oeste: imagens antes/depois idênticas em bytes, SHA-256 `173555d8558deeb3eb7279f37a799ed0acc2c50560331d714cf04d7463ea288a`.
- Testes da Exporural: **43 aprovados**, incluindo cinco testes novos; **duas falhas preexistentes**, reproduzidas na base (38 aprovados): referência C4/E-06 e expectativa de perímetro das sete ruas. Relatórios: `baseline-tests.json` e `final-tests.json`.
- Interseção de cada triângulo dos taludes com os polígonos comerciais, vias e pavilhões: **área zero**, verificada com recorte poligonal. Não apenas os vértices: o teste verifica a superfície inteira de cada triângulo. A conectividade dos índices também comprova que a ligação Pavilhão 5–Q-R-02 é uma única superfície, sem trechos desconectados.
- Arquitetura: **24 aprovados e três falhas preexistentes** (orientação D1/Arena, poste de B7 e snapshot QUADRA-G). Referências anteriores: `restroom-baseline-tests.json` (17/2) e `alameda-baseline-tests.json` (2/1); a última foi executada em uma cópia do commit base. Resultado atual: `architecture-tests.json`, incluindo os cinco testes da Exporural. Esses totais se sobrepõem ao grupo anterior e não devem ser somados.
- Contratos comerciais e públicos: **71/71 aprovados** em oito suítes, cobrindo preços, áreas oficiais, esquinas, seleção irregular, modo vendas e política pública. Relatório: `commercial-tests.json`.
- TypeScript, ESLint dos arquivos alterados e build de produção aprovados. O build mantém os avisos de tamanho de chunks e base Browserslist antiga.
- Runtime: sete poses equivalentes antes/depois e vistas adicionais da conexão, Q-R-13, Pavilhão 5, banheiro e Alameda; seleção por busca de Q-R-02, Q-R-14, E-07 e D1 com painéis corretos; zoom, pan e rotação com Canvas preservado; viewport móvel sem overflow.
- Quinze transições dia/noite/compatibilidade: nenhuma perda de contexto, nenhum erro JavaScript/GLSL e recursos estabilizados nos três perfis. Dados completos em `final/runtime.json`.
- Mesmo enquadramento próximo do Q-R-02: chamadas **174 → 178**, triângulos **368.104 → 392.158**, geometrias **576 → 582**, texturas **130 → 130**. São contadores do renderizador, não medições de FPS.
- Nenhuma escrita no backend foi tentada pela validação.

## Ambiente e limites

Chrome 153.0.8010.48 headless, Windows, Intel UHD / ANGLE D3D11, viewport desktop 1366×900, Canvas 1285×814, DPR 1. Vite local, fixture sintética de autenticação/organização e inventário canônico, recursos aquecidos antes das comparações de estabilidade. O viewport 390×844 é emulação de tamanho, sem certificação de Safari/iPhone/Android físico, produção autenticada ou latência de carregamento em rede real.

Referências visuais: as três capturas do mapa e as fotografias `WhatsApp Image 2026-09-21 at 16.59.06 (1).jpeg`, `16.58.38 (1).jpeg` e `16.58.11 (1).jpeg` fornecidas pelo solicitante. Também foram usadas as fotos `18.03.17.jpeg` (banheiro), `18.03.17 (1).jpeg` e `18.03.17 (2).jpeg` (Alameda). As fotos comprovam a existência e o caráter do conjunto e da encosta; não informam medidas de cercamento ou cotas altimétricas. Os anexos originais não são republicados nesta PR.

## Reprodução

Com Vite em `127.0.0.1:4198` e Playwright disponível por `PLAYWRIGHT_MODULE`:

```powershell
node scripts/exporural/landscape.cjs before
node scripts/exporural/landscape.cjs final --verify
npm test -- src/test/commercialMapExporuralLandscape.test.ts --maxWorkers=2
npm run typecheck
npm run build
```

O script usa a fixture existente, bloqueia alterações remotas e preserva diagnósticos, poses, capturas e hash integral do inventário. A rota pública mantém sua política de apresentação existente.
