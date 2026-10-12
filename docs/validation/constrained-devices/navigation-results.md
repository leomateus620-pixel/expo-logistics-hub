# Navegação com qualidade equivalente

Base `8f3e871010ebfeab45824ba042183127da3b15e3`; candidato de código `38aff99abd08261e7523a1855ca074ff1c350008`. SHA de cada trial confirmado pelo manifest servido e incluído nas verificações.

40 percursos aceitos. Comparações solicitadas concluídas.

HIGH fixo, buffer 1280 × 720, DPR 1. Cena completa, bloom/SMAA/sharpen e sombras canônicos, sem ablação. Uma cena residente por vez. A rotação contínua tem três repetições por pose/versão; gestos curtos e zoom/pan, uma. Intervalos ativos reais incluem damping; todos os stalls são conservados. O resumo usa nearest-rank p50/p95/p99 por run. A tabela mostra faixas entre runs, nunca p95 populacional ou mediana de percentis.

| CPU simulada | Pose/cenário | Versão | runs | p50 faixa(ms) | p95 faixa(ms) | p99 faixa(ms) | máximo(ms) | stalls>50ms |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1× | overview/continuous | baseline | 3 | 16.7–16.7 | 16.8–17.3 | 16.8–17.9 | 18.4 | 0 |
| 1× | overview/short | baseline | 1 | 16.7–16.7 | 16.9–16.9 | 17.4–17.4 | 17.6 | 0 |
| 1× | overview/zoom-pan | baseline | 1 | 16.7–16.7 | 16.8–16.8 | 17.5–17.5 | 17.5 | 0 |
| 1× | close/continuous | baseline | 3 | 16.7–16.7 | 16.8–18 | 17.5–18.6 | 18.7 | 0 |
| 1× | close/short | baseline | 1 | 16.7–16.7 | 16.8–16.8 | 17.4–17.4 | 17.6 | 0 |
| 1× | close/zoom-pan | baseline | 1 | 16.7–16.7 | 17–17 | 17.6–17.6 | 17.7 | 0 |
| 1× | overview/continuous | candidate | 3 | 16.7–16.7 | 16.8–18.6 | 17.4–18.7 | 18.8 | 0 |
| 1× | overview/short | candidate | 1 | 16.7–16.7 | 17.5–17.5 | 17.7–17.7 | 17.8 | 0 |
| 1× | overview/zoom-pan | candidate | 1 | 16.7–16.7 | 17.3–17.3 | 18.1–18.1 | 18.7 | 0 |
| 1× | close/continuous | candidate | 3 | 16.7–16.7 | 17.5–18.6 | 18.3–18.7 | 18.8 | 0 |
| 1× | close/short | candidate | 1 | 16.7–16.7 | 18.2–18.2 | 18.5–18.5 | 18.5 | 0 |
| 1× | close/zoom-pan | candidate | 1 | 16.7–16.7 | 17.7–17.7 | 17.8–17.8 | 18.2 | 0 |
| 4× | overview/continuous | baseline | 3 | 16.6–16.7 | 17.6–18.5 | 18–19.1 | 19.6 | 0 |
| 4× | overview/short | baseline | 1 | 16.6–16.6 | 17.6–17.6 | 18–18 | 19 | 0 |
| 4× | overview/zoom-pan | baseline | 1 | 16.7–16.7 | 18–18 | 18.7–18.7 | 18.8 | 0 |
| 4× | close/continuous | baseline | 3 | 16.7–16.7 | 17.7–18.6 | 17.9–18.9 | 19.1 | 0 |
| 4× | close/short | baseline | 1 | 16.7–16.7 | 17.6–17.6 | 17.8–17.8 | 18 | 0 |
| 4× | close/zoom-pan | baseline | 1 | 16.7–16.7 | 17.5–17.5 | 17.8–17.8 | 18 | 0 |
| 4× | overview/continuous | candidate | 3 | 16.6–16.7 | 17.8–18.3 | 18.1–18.9 | 19.5 | 0 |
| 4× | overview/short | candidate | 1 | 16.6–16.6 | 17.6–17.6 | 17.9–17.9 | 20.2 | 0 |
| 4× | overview/zoom-pan | candidate | 1 | 16.8–16.8 | 18.2–18.2 | 18.6–18.6 | 19 | 0 |
| 4× | close/continuous | candidate | 3 | 16.6–16.7 | 17.3–18.6 | 17.5–19.1 | 19.4 | 0 |
| 4× | close/short | candidate | 1 | 16.7–16.7 | 17.2–17.2 | 17.4–17.4 | 17.5 | 0 |
| 4× | close/zoom-pan | candidate | 1 | 16.7–16.7 | 17.3–17.3 | 17.6–17.6 | 18.1 | 0 |

A cadência saudável pode ser igual na mediana e ainda variar nas caudas; os runs individuais preservam essa diferença. Sem timer GPU/submissão separados, não atribuir variação a GPU/CPU ou declarar ganho físico. CPU4 é emulação no Apple M5, não certifica desktop integrado antigo/Android. Energia/térmica/clocks/driver shader cache não controlados.

[navigation-summary.json](navigation-summary.json) conserva cada run, p99 recalculado, janelas, long tasks, invariantes, qualidade/targets, câmeras, seleção, contadores e SHA. Raw frames/capturas completas ficam nos paths locais descritos e não são duplicados na PR. O resumo confirma que suas contagens/p50/p95/stalls reproduzem o harness existente.

Reprodução: definir `MAP_NAV_SUMMARY_INPUTS=/tmp/fenasoja-map-navigation-desktop,/tmp/fenasoja-map-navigation-cpu4` ao executar `scripts/constrained-devices/summarize.cjs`. Datasets incompletos não entram no resultado. Validação visual/funcional e preparação terminal são evidências separadas.
