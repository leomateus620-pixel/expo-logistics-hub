# Modo Visita: carrinho, helicóptero e Sojinha

## Implementação

- `VisitMode` conserva o Canvas, renderer, câmera e frame loop do Mapa Comercial. `VisitVehicleManager` coordena a máquina de estados sem atualizar React por frame.
- O carrinho usa aceleração, freio, ré, esterçamento e rodas transformadas pelo controlador cinemático. O helicóptero usa aceleração amortecida, hover, yaw, inclinação visual, rotores e pouso progressivo.
- As colisões consultam o `VisitWorld` e o índice espacial com volumes simplificados por veículo. `VisitLandingResolver` verifica inclinação, área, altura, bordas de telhado e folga de fuselagem/rotor.
- A interação em veículos acontece somente por clique/toque. `VisitVehicleInteraction` consulta candidatos indexados e resolve o POI oficial; não faz raycast global por frame.
- `VisitSojinhaModel` substitui somente a apresentação do personagem. O `VisitCharacterController`, o passo de pernas, o collider e as câmeras de caminhada permanecem no runtime existente.
- Os modelos procedurais são fallback leve. `VisitVehicleAssetAdapter` aceita GLB otimizado com nós de rodas ou rotores sem alterar controles, câmeras ou colisões.

## Evidência visual

- [Sojinha frontal, lateral e traseiro](sojinha-front-side-back.png)
- [Sojinha dentro do Modo Visita](sojinha-in-visit.png)
- [Helicóptero pousado](desktop-no-preference-1440x900-helicopter-landed.png)
- [Helicóptero em voo](desktop-no-preference-1440x900-helicopter-flying.png)

## Medições

Ambiente: Windows, Chrome headless 153, ANGLE D3D11 em Intel UHD / i5-1035G1; fixture oficial do Mapa Comercial, 1440×900 desktop e emulação Chromium 390×844/844×390 para mobile. Contextos de navegador novos; caches de SO/GPU mantidos. Resultados não equivalem a testes em iPhone/Safari ou Android físico.

| Recurso fallback | Triângulos | Draw calls | Texturas |
| --- | ---: | ---: | ---: |
| Carrinho | 14.070 | 24 | 1 atlas compartilhado |
| Helicóptero | 15.242 | 18 | 1 atlas compartilhado |

Na comparação controlada contemporânea de caminhada de seis segundos, o build anterior mediu **46,7 FPS / 21,4 ms** e o build final com Sojinha mediu **46,8 FPS / 21,4 ms**, ambos com **493 draw calls e 654.650 triângulos** naquela posição. Uma execução anterior do build final mediu 44,1 FPS, evidenciando variação entre amostras. Nenhuma dessas medidas locais isoladas demonstra ganho ou perda causal de desempenho. O bundle inicial do mapa terminou em **523.852 bytes gzip**; renderer/física/PDF continuam fora do carregamento anterior à consulta.

## Validação

- TypeScript, ESLint focado e 19 testes Vitest focados: passaram.
- Fluxos legados de caminhada, interior explícito, retorno, dia/noite e pausa por perda de foco: passaram no browser (`regression/checks.json`).
- Recuperação do WebGL com carrinho parado: deslocamento zero durante a interrupção, movimento após restauração, uma instância de Canvas/renderer/controles (`cart-context-recovery.json`).
- Vinte entradas/saídas da visita com o Sojinha: geometrias **564→564**, texturas **132→132**, programas **221→221**, nós DOM **540→540** e listeners **352→352** (`regression/cycle-audit.json`). Uma primeira rodada detectou +16 geometrias por sessão; a liberação explícita das malhas corrigiu essa regressão. O heap usado após GC variou **+3,31 MB** nos 20 ciclos e fica registrado como observação, sem atribuição causal.
- A sequência estendida de **40 ciclos** repetiu a estabilidade dos cinco contadores (`regression-40/cycle-audit.json`). O heap após GC foi de **56,0 MB no ciclo 20 para 56,9 MB no ciclo 40**; houve oscilação e queda em ciclos intermediários. Isso não substitui uma medição de memória em dispositivo físico de longa duração.
- Matriz final de desktop/mobile e `prefers-reduced-motion` em `completed.json` e nos seis arquivos por perfil nesta pasta.
- Capturas e JSONs registram FPS, frame time, draw calls, triângulos, recursos WebGL, saúde do renderer e identidade do Canvas. Módulos de QA ficam em `scripts/commercial-map-performance/`.

| Perfil final | Caminhada FPS | Carrinho FPS | Helicóptero FPS | p95 heli ms | Stalls heli >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop 1440×900, normal | 29,6 | 33,4 | 40,0 | 34,4 | 8 |
| Desktop 1440×900, reduced | 31,3 | 30,0 | 48,1 | 25,8 | 5 |
| Mobile 390×844, normal | 60,0 | 60,0 | 60,0 | 16,9 | 0 |
| Mobile 844×390, normal | 54,6 | 54,2 | 58,9 | 18,3 | 5 |
| Mobile 390×844, reduced | 60,1 | 60,0 | 59,9 | 17,0 | 1 |
| Mobile 844×390, reduced | 59,5 | 57,8 | 58,5 | 20,3 | 1 |

Todas as seis execuções passaram nas verificações funcionais e terminaram com `status=ready`, sem perda de contexto nem erro do renderer. As janelas são capturadas em posições/câmeras diferentes, então a tabela não é uma comparação causal de custo entre veículos. Os valores desktop variaram ao longo da bateria. Repetições do helicóptero oscilaram entre 0 e +5 geometrias e 0 e +2 texturas, sem crescimento de programas; a carga progressiva da cena pode contribuir para essa diferença, que requer observação em sessões prolongadas.

A matriz de seis perfis precedeu a correção localizada na desmontagem das geometrias do Sojinha. No build corrigido foram repetidos os 20 ciclos de sessão, a recuperação do WebGL com carrinho e a comparação controlada de caminhada; todos passaram. A correção não altera controles, câmeras ou modelos enquanto a visita está ativa.

## Limites

- O GLB definitivo do helicóptero e do carrinho ainda não foi fornecido. A apresentação atual é uma modelagem leve e substituível, baseada nas referências visuais.
- Mobile foi testado por emulação de toque/viewport em Chromium; multitouch real, Safari/iPhone, Android físico e comportamento térmico prolongado não foram validados aqui.
