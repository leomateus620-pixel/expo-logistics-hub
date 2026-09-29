# Restaurante, Portão 2 e árvores internas — resultados da captura atual

Gerado por `scripts/commercial-map-performance/benvenuto-reports.cjs` a partir de [summary.json](summary.json). Os números abaixo correspondem aos arquivos atuais de `before/` e `after/`; o relatório não representa aprovação automática da revisão visual, dos testes ou da PR.

Base comparada: `9ddda43f`. Navegador: Chrome 154 headless / Windows / ANGLE D3D11 / Intel UHD.

Desktop: 1440 × 900. Mobile **emulado**: 390 × 844 no mesmo computador Windows com Intel UHD; não é resultado de celular físico, Safari/iOS nem validação de uma variedade de GPUs. A resolução efetiva segue o DPR adaptativo registrado em cada rodada.

Condições do coletor: One fresh context per device; production diagnostic fixture; sequential runs without parallel builds/tests; 3 x 8 s navigation; adaptive quality unchanged.

Cada perfil usa um contexto novo, sem build/teste concorrente e sem limitação artificial de rede. São três trechos determinísticos de navegação de oito segundos; o diagnóstico guarda até 240 amostras recentes por janela. Tempos de entrada são observações de uma execução por fase. Cache do driver, temperatura e carga do sistema não são totalmente controlados; diferenças pequenas não comprovam ganho de desempenho generalizável.

Draw calls abaixo são os valores registrados durante cada uma das três rodadas de navegação, na ordem do roteiro. Não são médias por segundo. A fotografia estática pode conservar um quadro com passes ocasionais de sombra; seu contador não é usado como comparação de desempenho.

Bytes de geometria são buffers encontrados na cena. Texturas são estimativas RGBA com mipmaps automáticos, **não VRAM física medida**; mipmaps manuais, render targets e alocações internas do driver não estão contabilizados. Contagens de geometrias/texturas/programas indicam recursos conhecidos pelo renderer e não equivalem a bytes de memória gráfica.

## Desktop

| Métrica | Antes | Depois |
| --- | --- | --- |
| Entrada: Canvas (s) | 3,474 | 1,129 |
| Entrada: mapa pronto (s) | 21,665 | 14,241 |
| Entrada: hidratação completa (s) | 115,3 | 76,847 |
| FPS das amostras de navegação | 27,517 | 34,459 |
| Tempo de quadro P95 (ms) | 40,2 | 30,7 |
| Amostras de navegação | 663 | 720 |
| FPS por rodada 1 / 2 / 3 | 27,041 → 27,665 → 27,844 | 33,766 → 34,594 → 35,041 |
| P95 por rodada 1 / 2 / 3 (ms) | 42,6 → 39,3 → 38,6 | 31,1 → 30,2 → 29,8 |
| Draw calls em navegação: rodada 1 / 2 / 3 | 230 → 215 → 206 | 236 → 220 → 211 |
| DPR em navegação: rodada 1 / 2 / 3 | 0,9 → 0,9 → 0,9 | 0,9 → 0,9 → 0,9 |
| Qualidade em navegação: rodada 1 / 2 / 3 | MEDIUM → MEDIUM → MEDIUM | MEDIUM → MEDIUM → MEDIUM |
| Buffers de geometria (bytes) | 13.988.964 | 14.066.254 |
| Buffers de geometria (MiB) | 13,341 | 13,415 |
| Texturas estimadas (bytes) | 52.095.659 | 53.253.461 |
| Texturas estimadas (MiB) | 49,682 | 50,786 |
| Recursos na vista inicial: geometrias / texturas / programas | 566 / 132 / 223 | 575 / 137 / 237 |
| Recursos aquecidos: sequência geometrias / texturas / programas | 597 / 133 / 225 → 597 / 133 / 225 → 597 / 133 / 225 → 597 / 133 / 225 → 597 / 133 / 225 → 597 / 133 / 225 | 606 / 138 / 240 → 606 / 138 / 240 → 606 / 138 / 240 → 606 / 138 / 240 → 606 / 138 / 240 → 606 / 138 / 240 |
| Contagens aquecidas iguais em todas as amostras | sim | sim |

Enquadramentos comparados: 8. Diferença máxima de posição da câmera: **0**; diferença máxima do alvo: **0** (unidades do mapa).

### Interação e integridade

| Verificação | Antes | Depois |
| --- | --- | --- |
| Erros de página registrados | 0 | 0 |
| Overflow em retrato | não | não |
| Saúde da cena / caminho | ready / post | ready / post |
| Perdas de contexto antes do smoke | 0 | 0 |
| Canvas / renderer / controles; Canvas / controles ativos | 1 / 1 / 1; ativos 1 / 1 | 1 / 1 / 1; ativos 1 / 1 |
| Deslocamento na visita do roteiro (m) | 2,892 | 2,89 |
| Smoke C2/A2: resultado declarado pelo roteiro | não | sim |
| Seleção C2/A2 | C2: sim; A2: sim | C2: sim; A2: sim |
| Câmeras de seleção iguais dia/noite | C2: sim; A2: sim | C2: sim; A2: sim |
| Chegada A2 pelo lado da avenida | não | sim |
| Chegada alinhada com passagem direita | não | sim |
| Chegada voltada ao interior do parque | não | sim |
| Percurso atravessa a passagem coberta | não | sim |
| Posição de visita igual dia/noite | sim | sim |
| Caminhada frontal / lateral (m) | 2,136 / 0,884 | 9,502 / 2,88 |
| Retomada do movimento (m) | 2,619 | 2,656 |
| Cancelamento de toque aprovado pelo roteiro | não registrado | não registrado |
| Deriva após cancelamento (m) | não registrado | não registrado |
| Identidade preservada no retorno C2/A2 | sim | sim |

## Mobile emulado

| Métrica | Antes | Depois |
| --- | --- | --- |
| Entrada: Canvas (s) | 1,338 | 1,034 |
| Entrada: mapa pronto (s) | 18,755 | 15,183 |
| Entrada: hidratação completa (s) | 43,481 | 36,415 |
| FPS das amostras de navegação | 53,48 | 56,55 |
| Tempo de quadro P95 (ms) | 22,7 | 19,5 |
| Amostras de navegação | 720 | 720 |
| FPS por rodada 1 / 2 / 3 | 46,344 → 57,349 → 58,545 | 54,603 → 56,74 → 58,437 |
| P95 por rodada 1 / 2 / 3 (ms) | 23,3 → 18,2 → 18 | 20,1 → 18,5 → 18,2 |
| Draw calls em navegação: rodada 1 / 2 / 3 | 178 → 169 → 167 | 182 → 173 → 171 |
| DPR em navegação: rodada 1 / 2 / 3 | 1,35 → 1,215 → 1,215 | 1,35 → 1,35 → 1,35 |
| Qualidade em navegação: rodada 1 / 2 / 3 | MEDIUM → MEDIUM → MEDIUM | HIGH → HIGH → HIGH |
| Buffers de geometria (bytes) | 13.893.492 | 13.970.782 |
| Buffers de geometria (MiB) | 13,25 | 13,324 |
| Texturas estimadas (bytes) | 53.144.235 | 54.302.037 |
| Texturas estimadas (MiB) | 50,682 | 51,786 |
| Recursos na vista inicial: geometrias / texturas / programas | 551 / 131 / 223 | 560 / 136 / 237 |
| Recursos aquecidos: sequência geometrias / texturas / programas | 581 / 132 / 225 → 581 / 132 / 225 → 581 / 132 / 225 → 581 / 132 / 225 → 581 / 132 / 225 → 581 / 132 / 225 | 590 / 137 / 240 → 590 / 137 / 240 → 590 / 137 / 240 → 590 / 137 / 240 → 590 / 137 / 240 → 590 / 137 / 240 |
| Contagens aquecidas iguais em todas as amostras | sim | sim |

Enquadramentos comparados: 8. Diferença máxima de posição da câmera: **0**; diferença máxima do alvo: **0** (unidades do mapa).

### Interação e integridade

| Verificação | Antes | Depois |
| --- | --- | --- |
| Erros de página registrados | 0 | 0 |
| Overflow em retrato | não | não |
| Saúde da cena / caminho | ready / post | ready / post |
| Perdas de contexto antes do smoke | 0 | 0 |
| Canvas / renderer / controles; Canvas / controles ativos | 1 / 1 / 1; ativos 1 / 1 | 1 / 1 / 1; ativos 1 / 1 |
| Deslocamento na visita do roteiro (m) | 2,899 | 2,907 |
| Smoke C2/A2: resultado declarado pelo roteiro | não | sim |
| Seleção C2/A2 | C2: sim; A2: sim | C2: sim; A2: sim |
| Câmeras de seleção iguais dia/noite | C2: sim; A2: sim | C2: sim; A2: sim |
| Chegada A2 pelo lado da avenida | não | sim |
| Chegada alinhada com passagem direita | não | sim |
| Chegada voltada ao interior do parque | não | sim |
| Percurso atravessa a passagem coberta | não | sim |
| Posição de visita igual dia/noite | sim | sim |
| Caminhada frontal / lateral (m) | 2,138 / 0,883 | 9,493 / 2,896 |
| Retomada do movimento (m) | 2,641 | 0,226 |
| Cancelamento de toque aprovado pelo roteiro | sim | sim |
| Deriva após cancelamento (m) | 0 | 0 |
| Identidade preservada no retorno C2/A2 | sim | sim |

## Leitura dos resultados

A ausência de erros neste roteiro não substitui teste em hardware físico. Flags ausentes significam “não registrado”, e não aprovação. O smoke complementar é executado depois das medições e seus tempos não entram no FPS ou na entrada. Um resultado negativo na base histórica pode documentar justamente o defeito corrigido; cada flag deve ser lida com sua fase.

A galeria [comparison.html](comparison.html) e os JSON brutos preservam as capturas e os detalhes. Build, testes dirigidos, estado dos checks remotos e limitações da revisão visual são documentados separadamente no [README](README.md).
