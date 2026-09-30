# Métricas da navegação — comparação serial e política adaptativa

Fonte: docs/validation/navigation-resolution/evidence/compare-HIGH-dpr1-summary.json. Chrome 154.0.8037.58. 6 trials concluídos; 20 runs; ordem A1/B1/B2/A2/A3/B3. Não utiliza excluded-dual-context.

HIGH fixo, DPR de dispositivo emulado 1. Orçamento: mediana 33,3 ms; p95 50 ms; engasgo >50 ms. Intervalos somente nas janelas ativas de cameraNavigating, incluindo damping. Sem gravação de vídeo nessa comparação.

## Rotação contínua — 3 repetições por revisão/pose

| Pose/revisão | R1: mediana/p95; engasgos/amostras | R2 | R3 | Faixa medianas; faixa p95 | Engasgos soma/faixa | Resizes R1/R2/R3 |
| --- | --- | --- | --- | --- | --- | --- |
| overview/baseline | 31.3/37.9 ms; 0/225 | 39.5/52 ms; 13/188 | 39.1/60.4 ms; 26/176 | 31.3–39.5; 37.9–60.4 ms | 39/0–26 | 2/2/2 |
| overview/candidate | 36.2/47.1 ms; 3/202 | 36/40.4 ms; 0/204 | 34.2/59.9 ms; 24/188 | 34.2–36.2; 40.4–59.9 ms | 27/0–24 | 0/0/0 |
| close/baseline | 25.2/28.2 ms; 0/249 | 31.1/35.9 ms; 3/205 | 27.5/30.6 ms; 0/219 | 25.2–31.1; 28.2–35.9 ms | 3/0–3 | 2/2/2 |
| close/candidate | 32.2/37.6 ms; 0/214 | 34.7/40.3 ms; 0/190 | 26.9/31.2 ms; 1/236 | 26.9–34.7; 31.2–40.3 ms | 1/0–1 | 0/0/0 |

## Movimentos curtos e zoom/pan — uma execução por revisão/pose

| Pose/cenário/revisão | Mediana/p95/max ms | Engasgos/amostras | Resizes/setSize/setPixelRatio |
| --- | --- | --- | --- |
| overview/short/baseline | 32.2/47.5/80.4 | 7/233 | 6/12/6 |
| overview/short/candidate | 35.1/43.8/48 | 0/235 | 0/0/0 |
| overview/zoom-pan/baseline | 37.2/59.3/80 | 11/110 | 10/20/10 |
| overview/zoom-pan/candidate | 36.5/41.6/46.2 | 0/120 | 0/0/0 |
| close/short/baseline | 23.2/29.8/37.2 | 0/202 | 6/12/6 |
| close/short/candidate | 31.8/34.7/48.7 | 0/200 | 0/0/0 |
| close/zoom-pan/baseline | 24.1/28.1/66.5 | 1/127 | 20/40/20 |
| close/zoom-pan/candidate | 28.7/33.1/35.3 | 0/117 | 0/0/0 |

## Recursos da rotação contínua (antes→depois, R1/R2/R3)

| Pose/revisão | Draw calls | Triângulos | Geometrias | Texturas | Programas |
| --- | --- | --- | --- | --- | --- |
| overview/baseline | 814→816; 814→816; 814→816 | 656670→685712; 656670→685712; 656670→685712 | 579→579; 579→579; 579→579 | 136→136; 136→136; 136→136 | 242→242; 242→242; 242→242 |
| overview/candidate | 814→816; 814→816; 814→816 | 656670→685712; 656670→685712; 656670→685712 | 579→579; 579→579; 587→587 | 136→136; 136→136; 136→136 | 242→242; 242→242; 242→242 |
| close/baseline | 268→252; 268→252; 268→252 | 502983→461071; 502983→461071; 502983→461071 | 606→608; 606→607; 606→607 | 141→141; 141→141; 141→141 | 243→243; 243→243; 243→243 |
| close/candidate | 630→252; 630→252; 268→252 | 899618→461071; 899618→461071; 502983→461071 | 606→608; 606→607; 614→615 | 141→141; 141→141; 141→141 | 243→243; 243→243; 243→243 |

## Invariantes e limites

```json
{
  "invalidFocus": 0,
  "failedHealth": 0,
  "identityFailures": 0,
  "selectionFailures": 0,
  "inventoryFailures": 0,
  "pathValues": [
    "post"
  ],
  "qualityChanges": 0,
  "errors": {
    "baseline-HIGH-dpr1-trial1": [],
    "candidate-HIGH-dpr1-trial1": [],
    "candidate-HIGH-dpr1-trial2": [],
    "baseline-HIGH-dpr1-trial2": [],
    "baseline-HIGH-dpr1-trial3": [],
    "candidate-HIGH-dpr1-trial3": []
  }
}
```

A: DPR 1↔0,9; drawing buffer 1265×720↔1138×648. B: DPR 1 e drawing buffer 1265×720 constantes em todos os 10 runs. B: zero effectiveResizes, setSize e setPixelRatio em todos os 10 runs; A: rotação 2, curtos 6, zoom/pan overview 10 e close 20 resizes por run.

Targets full-size finais EffectComposer.Buffer/SMAA.Edges/SMAA.Weights: 1265×720 em A e B. No raw overview/continuous/R1, as 72 capturas de A com cameraNavigating=true mostram DPR 0,9 e esses três tipos de target em 1138×648; as 75 capturas de B mostram DPR 1 e 1265×720. Em B, não houve resize. Nomes/dimensões de bloom/mips obedecem reduções intencionais. Contagens de recursos não são GPU ms nem bytes.

Observação de recursos: texturas/programas permanecem constantes antes→depois nos runs contínuos; close acrescenta 1–2 geometrias em ambas as revisões. Há variação de contagem inicial entre contextos novos. O snapshot antes de close em B1/B2 reporta 630 calls/899.618 triângulos, contra 268/502.983 em A; após o gesto ambos reportam 252/461.071. Essas contagens não comprovam igualdade de workload em cada snapshot.

Amostra 3 overview: A p95 60,4 ms com 26 engasgos; B p95 59,9 ms com 24. Ambas ultrapassam a tolerância p95; A2 overview também ultrapassa (52 ms). As medianas overview de B ficam em 34,2–36,2 ms, acima de 33,3 ms; close de B2 também (34,7 ms). A meta não foi universalmente atendida e há engasgos remanescentes. Melhora confirmada: desaparece o desconto/resize por gesto. Ganho universal de FPS/cintilação não está estabelecido.

## Política adaptativa completa — gesto sustentado de 120 s

Fonte: `evidence/sustained-adaptive-dpr1-summary.json` e `evidence/candidate-adaptive-dpr1-overview-continuous-1-raw.json`. Um único contexto candidato; DPR de dispositivo emulado 1, pose overview, aba visível/em foco. A janela ativa incluindo damping durou 121,6 s. As medições foram salvas antes da falha posterior de smoke; o exit code dessa falha não invalida retrospectivamente a janela já encerrada e registrada.

| Amostras | Mediana | p95 | Engasgos >50 ms | Máximo | Tarefas longas | DPR/buffer | Resizes/setSize/setPixelRatio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3.388 | 34,2 ms | 44,3 ms | 96 | 805,5 ms | 64 | 1 / 1265×720 constante | 0/0/0 |

A cena começou com logical/scene tier MEDIUM/MEDIUM. A solicitação `sustained-slow-frames` alterou logical tier para LOW e preservou MEDIUM em movimento; o snapshot final ficou LOW/MEDIUM, com base/efetivo 1. Na pausa de 650 ms o commit LOW/LOW foi registrado antes do smoke. A duração acima mede scene MEDIUM, não o LOW após commit. Não houve promoção/downgrade repetido.

Nos 1.217 snapshots periódicos, geometrias 579, texturas 136 e programas 242 permaneceram constantes; draw calls/triângulos foram 814/656.670 antes e 816/685.712 depois. Identidade, seleção e inventário invariantes; caminho post, health ready, zero perdas de contexto durante a medição. Targets full-size do compositor e SMAA permaneceram em 1265×720. Isso não é uma estimativa de memória em bytes nem certificação térmica.

| Instrumentação assíncrona, cauda limitada a 240 | Amostras | Média | p95 |
| --- | --- | --- | --- |
| CPU | 240 | 31,663 ms | 40,6 ms |
| GPU, status supported | 227 | 34,514 ms | 38,494 ms |

34 queries GPU descartadas, zero disjoint e quatro pendentes no snapshot. Essas estatísticas não representam o gesto inteiro e CPU/GPU não foram somadas. Mediana ativa 34,2 ms ultrapassa a meta 33,3 ms; o ensaio não comprova 30 FPS universais ou ausência de engasgos.

Smoke, captura visual e DPR2 são verificações distintas. O primeiro smoke preservado capturou `beforeLoss` enquanto havia navegação; a repetição fica pendente e essa condição não comprova regressão de câmera.
