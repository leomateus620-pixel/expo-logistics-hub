# Benvenuto e entorno dos pavilhões — resultados da captura atual

Gerado por `scripts/commercial-map-performance/benvenuto-reports.cjs` a partir de [summary.json](summary.json). Os números abaixo correspondem aos arquivos atuais de `before/` e `after/`; o relatório não representa aprovação automática da revisão visual, dos testes ou da PR.

Base comparada: `4294ddbb`. Navegador: Chrome 154 headless / Windows / ANGLE D3D11 / Intel UHD.

Desktop: 1440 × 900. Mobile **emulado**: 390 × 844 no mesmo computador Windows com Intel UHD; não é resultado de celular físico, Safari/iOS nem validação de uma variedade de GPUs. A resolução efetiva segue o DPR adaptativo registrado em cada rodada.

Condições do coletor: One fresh context per device; production diagnostic fixture; sequential runs without parallel builds/tests; 3 x 8 s navigation; adaptive quality unchanged.

Cada perfil usa um contexto novo, sem build/teste concorrente e sem limitação artificial de rede. São três trechos determinísticos de navegação de oito segundos; o diagnóstico guarda até 240 amostras recentes por janela. Tempos de entrada são observações de uma execução por fase. Cache do driver, temperatura e carga do sistema não são totalmente controlados; diferenças pequenas não comprovam ganho de desempenho generalizável.

Draw calls abaixo são os valores registrados durante cada uma das três rodadas de navegação, na ordem do roteiro. Não são médias por segundo. A fotografia estática pode conservar um quadro com passes ocasionais de sombra; seu contador não é usado como comparação de desempenho.

Bytes de geometria são buffers encontrados na cena. Texturas são estimativas RGBA com mipmaps automáticos, **não VRAM física medida**; mipmaps manuais, render targets e alocações internas do driver não estão contabilizados. Contagens de geometrias/texturas/programas indicam recursos conhecidos pelo renderer e não equivalem a bytes de memória gráfica.

## Desktop

| Métrica | Antes | Depois |
| --- | --- | --- |
| Entrada: Canvas (s) | 1,583 | 2,106 |
| Entrada: mapa pronto (s) | 20,83 | 14,025 |
| Entrada: hidratação completa (s) | 114,467 | 75,9 |
| FPS das amostras de navegação | 28,339 | 34,479 |
| Tempo de quadro P95 (ms) | 40,8 | 30,7 |
| Amostras de navegação | 682 | 720 |
| FPS por rodada 1 / 2 / 3 | 27,171 → 28,969 → 28,878 | 34,012 → 34,722 → 34,712 |
| P95 por rodada 1 / 2 / 3 (ms) | 43,2 → 36,9 → 36,8 | 31 → 30,3 → 30,5 |
| Draw calls em navegação: rodada 1 / 2 / 3 | 331 → 340 → 348 | 334 → 344 → 353 |
| DPR em navegação: rodada 1 / 2 / 3 | 0,9 → 0,9 → 0,9 | 0,9 → 0,9 → 0,9 |
| Qualidade em navegação: rodada 1 / 2 / 3 | MEDIUM → MEDIUM → MEDIUM | MEDIUM → MEDIUM → MEDIUM |
| Buffers de geometria (bytes) | 13.899.236 | 13.975.546 |
| Buffers de geometria (MiB) | 13,255 | 13,328 |
| Texturas estimadas (bytes) | 48.185.344 | 50.348.032 |
| Texturas estimadas (MiB) | 45,953 | 48,016 |
| Recursos na vista inicial: geometrias / texturas / programas | 562 / 131 / 222 | 571 / 135 / 236 |
| Recursos aquecidos: sequência geometrias / texturas / programas | 592 / 136 / 222 → 592 / 136 / 222 → 592 / 136 / 222 → 592 / 136 / 222 → 592 / 136 / 222 → 592 / 136 / 222 | 600 / 140 / 237 → 600 / 140 / 237 → 600 / 140 / 237 → 600 / 140 / 237 → 600 / 140 / 237 → 600 / 140 / 237 |
| Contagens aquecidas iguais em todas as amostras | sim | sim |

Enquadramentos comparados: 6. Diferença máxima de posição da câmera: **0**; diferença máxima do alvo: **0** (unidades do mapa).

### Interação e integridade

| Verificação | Antes | Depois |
| --- | --- | --- |
| Erros de página registrados | 0 | 0 |
| Overflow em retrato | não | não |
| Saúde da cena / caminho | ready / post | ready / post |
| Perdas de contexto antes do smoke | 0 | 0 |
| Canvas / renderer / controles; Canvas / controles ativos | 1 / 1 / 1; ativos 1 / 1 | 1 / 1 / 1; ativos 1 / 1 |
| Deslocamento na visita do roteiro (m) | 2,892 | 2,881 |
| Smoke de recuperação executado | não | sim |
| Seleção coincide com interior aberto | não registrado | sim |
| Recuperação WebGL: saúde / caminho | não registrado | ready / direct |
| Deriva na recuperação (unidade do mapa) | não registrado | 0 |
| Movimento após recuperação (m) | não registrado | 2,589 |
| Identidade após recuperação | não registrado | 1 / 1 / 1; ativos 1 / 1 |
| Toque cancelado: personagem parado | não registrado | não registrado |
| Toque cancelado: deriva (unidade do mapa) | não registrado | não registrado |
| Overflow em paisagem | não registrado | não registrado |

## Mobile emulado

| Métrica | Antes | Depois |
| --- | --- | --- |
| Entrada: Canvas (s) | 1,156 | 1,236 |
| Entrada: mapa pronto (s) | 18,433 | 13,928 |
| Entrada: hidratação completa (s) | 44,757 | 34,622 |
| FPS das amostras de navegação | 53,63 | 59,155 |
| Tempo de quadro P95 (ms) | 22,5 | 17,7 |
| Amostras de navegação | 720 | 720 |
| FPS por rodada 1 / 2 / 3 | 48,395 → 57,127 → 56,272 | 58,71 → 59,999 → 58,773 |
| P95 por rodada 1 / 2 / 3 (ms) | 22,8 → 18,2 → 18,2 | 17,9 → 17,1 → 17,8 |
| Draw calls em navegação: rodada 1 / 2 / 3 | 205 → 209 → 212 | 209 → 213 → 216 |
| DPR em navegação: rodada 1 / 2 / 3 | 1,35 → 1,215 → 1,215 | 1,35 → 1,35 → 1,35 |
| Qualidade em navegação: rodada 1 / 2 / 3 | MEDIUM → MEDIUM → MEDIUM | HIGH → HIGH → HIGH |
| Buffers de geometria (bytes) | 13.794.692 | 13.871.002 |
| Buffers de geometria (MiB) | 13,156 | 13,228 |
| Texturas estimadas (bytes) | 49.233.920 | 51.396.608 |
| Texturas estimadas (MiB) | 46,953 | 49,016 |
| Recursos na vista inicial: geometrias / texturas / programas | 549 / 131 / 222 | 558 / 135 / 236 |
| Recursos aquecidos: sequência geometrias / texturas / programas | 582 / 134 / 222 → 582 / 134 / 222 → 582 / 134 / 222 → 582 / 134 / 222 → 582 / 134 / 222 → 582 / 134 / 222 | 590 / 138 / 237 → 590 / 138 / 237 → 590 / 138 / 237 → 590 / 138 / 237 → 590 / 138 / 237 → 590 / 138 / 237 |
| Contagens aquecidas iguais em todas as amostras | sim | sim |

Enquadramentos comparados: 6. Diferença máxima de posição da câmera: **0**; diferença máxima do alvo: **0** (unidades do mapa).

### Interação e integridade

| Verificação | Antes | Depois |
| --- | --- | --- |
| Erros de página registrados | 0 | 0 |
| Overflow em retrato | não | não |
| Saúde da cena / caminho | ready / post | ready / post |
| Perdas de contexto antes do smoke | 0 | 0 |
| Canvas / renderer / controles; Canvas / controles ativos | 1 / 1 / 1; ativos 1 / 1 | 1 / 1 / 1; ativos 1 / 1 |
| Deslocamento na visita do roteiro (m) | 2,877 | 2,882 |
| Smoke de recuperação executado | não | sim |
| Seleção coincide com interior aberto | não registrado | sim |
| Recuperação WebGL: saúde / caminho | não registrado | ready / direct |
| Deriva na recuperação (unidade do mapa) | não registrado | 0 |
| Movimento após recuperação (m) | não registrado | 2,66 |
| Identidade após recuperação | não registrado | 1 / 1 / 1; ativos 1 / 1 |
| Toque cancelado: personagem parado | não registrado | sim |
| Toque cancelado: deriva (unidade do mapa) | não registrado | 0 |
| Overflow em paisagem | não registrado | não |

## Leitura dos resultados

A ausência de erros neste roteiro não substitui teste em hardware físico. Flags ausentes significam “não registrado”, e não aprovação. O smoke complementar é executado depois das medições e seus tempos não entram no FPS ou na entrada. Um resultado negativo na base histórica pode documentar justamente o defeito corrigido; cada flag deve ser lida com sua fase.

A galeria [comparison.html](comparison.html) e os JSON brutos preservam as capturas e os detalhes. Build, testes dirigidos, estado dos checks remotos e limitações da revisão visual são documentados separadamente no [README](README.md).
