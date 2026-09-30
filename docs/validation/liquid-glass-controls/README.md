# Controles Liquid Glass — evidência local

Os controles usam o `CommercialMapPage` real pela rota de diagnóstico existente `/__dev/commercial-map-interface`, com `OFFICIAL_REFERENCE_DATA` e permissões de leitura. As capturas e medições não representam dados publicados, sessão administrativa autenticada ou dispositivos físicos.

O diagnóstico confirmou `CommercialMapTopBar` no desktop e `MapToolbar` com `showDesktopControls=false`, responsável pela versão compacta e Mais. A cascata foi concentrada em `commercial-map-topbar.css`: tokens e estados compartilhados, container `commercial-map` até 720 px e landscape até 950 × 520. As regras antigas do mobile foram removidas em vez de acumular sobrescritas. Os stores, callbacks, tooltips, atributos dos controles, permissões e ocultação nas experiências existentes continuam sendo a fonte do comportamento.

O acabamento final segue a direção refinada durante a revisão: cápsula azul acinzentada perceptivelmente translúcida, ícones Lucide brancos, contorno luminoso fino e profundidade nos botões. No desktop, os controles têm 54 px, ícones de 26 px, espaçamento de 14 px e cápsula de 76 px. No mobile, os alvos continuam com 44 px e o espaço disponível determina a rolagem nativa interna. Há uma única superfície com `backdrop-filter: blur(10px) saturate(1.12)`; o canvas e os botões não recebem filtros adicionais.

O pedido posterior do usuário mantém o efeito completo mesmo quando as preferências de redução de movimento ou transparência estão ativas. Essa decisão aplica-se somente a estes controles. O fallback para navegadores sem `backdrop-filter`, o prefixo Safari e as cores do sistema em `forced-colors` permanecem. O host desta validação solicita redução de transparência; o resultado final foi capturado com essa preferência nativa ativa e o vidro de 10 px efetivamente aplicado.

O escopo final também inclui cabeçalho compacto com Visita/Gestão em ícones, Lista dentro de Gestão, botão Vendas com carrinho/Flame Lucide e entrada CSS de 820 ms, uma iteração, no mount e na ativação OFF→ON. O ícone retorna ao repouso; alterações de outros estados não reiniciam a entrada. A área do mapa chega às bordas laterais e inferior com o dock recolhido; o botão do dock flutua e o modo compacto responde à largura real do shell.

## Comparação visual

As duas versões usam a mesma rota, fixture e viewport. As capturas comparáveis da candidata fixam posição/target/FOV/zoom da câmera registrada no baseline, após o preset `overview`. O novo layout imersivo amplia a área do canvas e altera seu aspecto; esse efeito esperado continua visível na composição. Os JSON registram a pose, resolução, qualidade e estado do renderer. Nos testes de interação e desempenho, a câmera continua usando o preset normal do produto.

| Condição | Antes | Depois |
| --- | --- | --- |
| Desktop, dia, 1440 × 900 | [Imagem](baseline/desktop-day.png) | [Imagem](candidate/desktop-day.png) |
| Desktop, noite, 1440 × 900 | [Imagem](baseline/desktop-night.png) | [Imagem](candidate/desktop-night.png) |
| Mobile, 320 × 740 | [Imagem](baseline/mobile-320-day.png) | [Imagem](candidate/mobile-320-day.png) |
| Mobile, 360 × 780 | [Imagem](baseline/mobile-360-day.png) | [Imagem](candidate/mobile-360-day.png) |
| Mobile, 390 × 844, dia | [Imagem](baseline/mobile-390-day.png) | [Imagem](candidate/mobile-390-day.png) |
| Mobile, 390 × 844, noite | [Imagem](baseline/mobile-390-night.png) | [Imagem](candidate/mobile-390-night.png) |
| Landscape, 844 × 390 | [Imagem](baseline/mobile-landscape-day.png) | [Imagem](candidate/mobile-landscape-day.png) |
| Container de 480 px em janela de 1440 px | [Imagem](baseline/narrow-container-480.png) | [Imagem](candidate/narrow-container-480.png) |

Também foram verificados [container de 800 px](candidate/narrow-container-800.png), [1920 px](candidate/desktop-1920-day.png) e [2560 px](candidate/desktop-2560-day.png). O runner afirma a largura real de 480/800 px; uma regra anterior do harness era vencida pela cascata e foi corrigida antes da evidência final.

Detalhes do acabamento: [dia](candidate/desktop-day-controls.png), [noite](candidate/desktop-night-controls.png). A captura [DPR 3](candidate/mobile-390-dpr3-day.png) avalia nitidez dos SVGs em escala de tela emulada; a resolução do canvas continua sob a política existente do mapa.

## Verificação de interação

O runner mede e registra: dimensões dos alvos; limites da cápsula e ausência de overflow da página; preset de câmera; foco desabilitado e habilitado após seleção; estados independentes de hidrologia, noite, chuva e ambiente; tooltip e navegação por teclado; abertura de Mais com Enter, Space e toque; retorno de foco com Escape; itens desabilitados e dismissão com um toque externo; swipe nativo iniciando sobre Mais; arraste dentro da barra sem mudança de câmera nem ativação; arraste no canvas fora da barra; rolagem horizontal nativa, revelação mínima do controle focado e estabilidade do scroll após mudança de modo; ausência de conversão da roda vertical; filtros em landscape; preferências do sistema e fallback simulado.

Os estados de ocultação usam os stores reais: início/saída de visita, entrada/saída de um pavilhão oficial e fase de apresentação lunar. O runner verifica a visibilidade resultante da página, sem tratar apenas a classe do shell como prova. Essa verificação de UI é distinta de certificar todas as transições 3D dessas experiências. As permissões autenticadas e o escopo da comissão dependem dos testes de contrato existentes, sem assumir privilégios na fixture de leitura.

A versão anterior abre o dropdown ao iniciar um swipe sobre Mais. A evidência está em [native-more-swipe-before.png](baseline/native-more-swipe-before.png). A nova implementação adia essa abertura até o clique limpo e mantém o teclado e a rolagem disponíveis. Uma expectativa antiga de zerar as transições em redução de movimento foi substituída pelo pedido posterior de preservar o efeito completo.

O cabeçalho completo foi verificado em 320/360/390 px, landscape, 1920/2560 px: alvos de pelo menos 44 px, sem cortes nos limites da janela. Gestão abre Lista e retorna ao mapa pelo workspace real. A fixture de referência não concede Vendas. Para verificar o botão e a animação, [header-tools-qa.cjs](../../../scripts/liquid-glass-controls/header-tools-qa.cjs) monta **o componente HeaderTools real**, isolado, com props explícitas `salesAvailable=true`, sem Canvas, alteração de capability, dados ou escrita comercial. Foram aprovadas 19 verificações; o [relatório](candidate/header-isolated-report.json) e a [captura aos 250 ms](candidate/header-isolated-sales-on.png) distinguem essa evidência da autorização de produção.

## Ambiente e método de desempenho

- Windows 11, build 26200; Intel Core i5-1035G1, quatro processadores lógicos.
- Google Chrome 154.0.8037.58, headless, ANGLE/D3D11, Intel UHD Graphics (0x00008A56).
- Vite em desenvolvimento; contexto novo; fixture local; sem throttling de CPU/rede; DPR 1; viewport desktop 1440 × 900; a resolução efetiva do canvas e o tier constam em cada amostra.
- Três repetições de quatro segundos por condição: dia com câmera em movimento, noite em movimento, chuva em movimento e noite + chuva + uso de foco da barra. Modos aquecidos antes de cada conjunto.
- `runtimeDiagnostics` fornece intervalo entre quadros e saúde/recursos. `renderingTiming` mede submissão de comandos de renderização na CPU e consultas GPU quando suportadas. As consultas GPU cobrem a renderização do canvas, sem medir diretamente a composição do blur CSS. Esses valores não são latência completa de interação.
- Um ensaio adicional alterna o blur de 10 px com `backdrop-filter:none`, três pares, na mesma cena aquecida de noite + chuva + câmera + foco. Só o filtro da cápsula é alterado temporariamente; as cores, o mapa e sua qualidade permanecem iguais. A ordem alternada reduz a influência de deriva entre versões. O JSON conserva amostras rAF e intervalos de quadro, além das distribuições.

As primeiras medições da candidata usaram o fallback opaco do host e foram interrompidas por recarga do Vite. Estão explicitamente excluídas em [excluded-host-preference-run.json](excluded-host-preference-run.json). Nos ensaios anteriores à mudança imersiva, caches da cena ainda cresciam durante os pares e não permitiam isolar o custo do filtro. Esses números estão separados em [prior-layout-measurements.json](prior-layout-measurements.json) e não são o resultado final.

O ensaio final foi executado com fonte congelada, uma única cena 3D aberta e nenhum build/teste concorrente. Foram concluídas 12 passagens do baseline e 12 da candidata. A candidata manteve tier `HIGH`, Canvas/renderer/OrbitControls únicos e zero perda de contexto/erro de renderização nas amostras. A área de renderização mudou de 1359 × 814 para 1440 × 828 pela alteração imersiva. O preset também se adapta a essa área; portanto, a diferença entre versões não isola o vidro.

| Câmera em movimento | Mediana do intervalo médio antes | Depois | Mediana p95 antes / depois |
| --- | ---: | ---: | ---: |
| Dia | 23,74 ms | 24,76 ms | 24,9 / 25,9 ms |
| Noite | 25,65 ms | 26,83 ms | 30,0 / 30,2 ms |
| Chuva | 23,99 ms | 25,07 ms | 26,0 / 32,0 ms |
| Noite + chuva + foco na barra | 25,48 ms | 26,64 ms | 35,2 / 30,5 ms |

O ensaio pareado final atingiu três amostras estáveis após aquecimento: 579 geometrias, 109 texturas, 189 programas, tier `HIGH` e 1440 × 828. As contagens permaneceram iguais nos seis trechos. Os pares alternam a ordem do filtro na mesma cena e movimento programado. O OrbitControls preserva seu damping; os diagnósticos registram pequenas diferenças de posição entre os trechos, sem exigir pose idêntica quadro a quadro.

| Par | Vidro 10 px: intervalo médio / p95 | Filtro desligado: intervalo médio / p95 |
| --- | ---: | ---: |
| 1 | 26,54 / 28,2 ms | 26,45 / 37,2 ms |
| 2 | 26,53 / 28,4 ms | 26,37 / 28,5 ms |
| 3 | 26,49 / 28,2 ms | 26,26 / 27,5 ms |

O intervalo médio com o filtro foi 0,09–0,23 ms maior nesses três pares. A submissão CPU variou de 13,32–18,14 ms e a GPU do canvas de 25,24–25,35 ms. São amostras curtas de Chromium headless neste host, sem medição direta do compositor CSS; não comprovam ganho ou ausência de regressão em outros dispositivos. Os valores não justificaram reduzir o blur nesta validação local. [Resumo numérico e metadados](performance-summary.json).

Resultados completos: [baseline/report.json](baseline/report.json) e [candidate/report.json](candidate/report.json). O relatório final acumula 235 verificações aprovadas da candidata, zero erros de página e 23 cenários capturados, além dos dois recortes da cápsula e três imagens do cabeçalho isolado. O resumo numérico deve ser lido junto dos tiers, filtros efetivamente aplicados e identidade do renderer registrados nesses arquivos.

## Reprodução

Inicie a versão original em `4210` e a branch candidata em `4211`, sem alterar código durante as medições. Feche outras cenas 3D e evite build/testes no mesmo intervalo.

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/Leonardo/.codex/tmp/dashboard-playwright/node_modules/playwright'
node scripts/liquid-glass-controls/browser-qa.cjs baseline http://127.0.0.1:4210
node scripts/liquid-glass-controls/browser-qa.cjs candidate http://127.0.0.1:4211
```

O caminho de Playwright pode ser substituído pela instalação disponível. O runner exige Chrome instalado e aceita somente URLs locais. `GLASS_QA_VISUAL_ONLY=1` faz só a revisão inicial de dia/noite; `GLASS_QA_BENCHMARK_ONLY=1` repete as medições e pares; `GLASS_QA_MOBILE_ONLY=1` continua a matriz móvel; `GLASS_QA_NARROW_ONLY=1` revalida containers. `GLASS_QA_FORCE_DEFAULT_MEDIA=1` aplica preferências neutras explicitamente via CDP, sem modificar configurações do sistema. O harness do cabeçalho é executado com `node scripts/liquid-glass-controls/header-tools-qa.cjs http://127.0.0.1:4211`.

`npm run typecheck` passou; `npm run build` passou em 37,88 s; ESLint dos 13 arquivos alterados passou. O conjunto pertinente soma 216 testes em 22 arquivos: 214 passaram e duas falhas de asserções de fonte já existentes foram reproduzidas em `6cd27b91`, sem falhas novas atribuíveis à mudança. [Resumo](tests-summary.json) e [evidência das falhas anteriores](baseline-test-failures.json).

Safari/iOS, Android físico, multitouch real, produção, safe areas de hardware físico e medições de latência ponta a ponta continuam fora desta evidência local.
