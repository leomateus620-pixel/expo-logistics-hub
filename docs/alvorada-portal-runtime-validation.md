# Alvorada no Portal — implementação e limites da validação

PR: #148. Base de investigação: `9abda2f2c799c133d5a430a988710b1e3a6ac5d4` e PR #147. Referência histórica anterior à migração: `c45c7c2397ee0af92a75cedeca903245debdfe84` (base da PR #144).

## Estado de liberação

**Em validação; não aprovada para produção.** O código desta PR trata falhas de ciclo de vida demonstráveis e permite coletar diagnóstico nos dispositivos reais. Não foi obtida a telemetria do iPhone do solicitante, do telefone de Fabiano ou dos desktops fotografados. Portanto, o motivo exato observado em cada dispositivo permanece desconhecido.

## O que a reprodução realmente mostrou

Execução anterior às correções: https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/34808646907

Foram coletados 24 cenários em um runner Linux: Chromium e WebKit, viewports desktop/mobile, três hosts (`standalone`, `minimal`, `portal-card`) e duas preferências de movimento. Em 12 cenários sem preferência de movimento reduzido foi selecionado WebGL. Nos outros 12, o mesmo runtime selecionou o CSS com `staticReason = reduced-motion`, sem criar Canvas. Não houve `pageerror` nos registros coletados.

Isso reproduz uma divergência de seleção de engine; **não prova que os aparelhos afetados estejam com movimento reduzido ativo**. A preferência precisa ser medida no aparelho. Os três hosts da fixture usam o mesmo runtime atual: `standalone` reproduz a topologia fixa, não a implementação histórica inteira. `portal-card` usa o componente real do card e seu CSS, não o Portal autenticado com toda sua carga de inicialização.

Os HEADs públicos de HTML, service worker, texturas, GeoJSON e imagens de colheita responderam HTTP 200 na coleta. HTML: `no-cache, must-revalidate, max-age=0`; worker: `no-cache`. Isso não certifica cache por usuário, decodificação Safari ou ausência de versões antigas em clientes reais.

## Correções incluídas

- Aguardar duas medições positivas e estáveis do host antes de montar o Canvas e cobrar o watchdog de preparação. Uma caixa temporariamente nula não vira diagnóstico de GPU incompatível. O latch de montagem permanece após resize.
- Manter movimento reduzido no renderizador canônico, amostrando enquadramentos da mesma cena com fades, em vez de escolher automaticamente o planeta CSS.
- Remover contextos descartáveis de sondagem do caminho normal de startup. A criação do contexto real usa `failIfMajorPerformanceCaveat: false` e preferência de energia padrão; a qualidade continua separada da capacidade.
- Preservar o Canvas e o relógio durante uma tentativa limitada de recuperação do contexto. Uma recuperação malsucedida continua explicitamente registrada como emergência.
- Registrar um quadro efetivamente renderizado da Terra antes de liberar a timeline; preservar o início em zero.
- Usar contagem de consumidores na liberação de texturas compartilhadas e adiar fechamento do ImageBitmap para não invalidar outro consumidor/replay de efeitos.
- Reforçar fallback de decodificação, preparação dos assets, tratamento de falhas secundárias e identificação de assets por build.
- Não recarregar automaticamente uma página saudável em `serviceWorker.controllerchange` durante a intro; limpar somente caches do namespace da aplicação na ativação do worker.
- Expor `data-visual-engine`, ambiente, contexto, estágios, recuperação e informações de build; adicionar painel acessível e cópia local em `?alvorada-debug=1`, sem transmissão automática.

O Three.js instalado é r170: esta PR não anuncia suporte WebGL1 que o renderizador instalado não oferece. A disponibilidade de WebGL1 é apenas diagnosticada.

## Validação das alterações preparadas

Execução: https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/34810779487

- 89 testes Alvorada passaram; zero testes falharam.
- `npm run build` passou (com aviso de tamanho de chunks).
- `npx tsc --noEmit -p tsconfig.app.json` passou sem mensagens.
- Patch validado: SHA-256 `479ef4a4c409f947ae50c7b5dc0c5bf975f624e54140a9573ff6cbd5af1b2719`.

O workflow transitório apenas aplicou o patch verificado, testou e preparou objetos Git. Não fez merge, deploy ou atualização de refs. Foi removido da árvore final. As alterações foram publicadas na branch da PR pelo conector GitHub.

## Uso do diagnóstico

Em um ambiente que contenha esta branch, acrescentar `alvorada-debug=1` à query da rota do Portal. Após reproduzir, acionar **Copiar diagnóstico**. O painel permanece fora da camada `aria-hidden` e após a volta da contagem. Comparar build/commit, preferência de movimento, engine, motivo de fallback, tamanho do host, contexto, assets e histórico antes de atribuir a falha ao hardware.

## Pendências que impedem aprovação final

- Telemetria e comparação no MESMO aparelho entre a implementação histórica, um card mínimo e o Portal autenticado completo.
- Nova avaliação visual em navegador das correções e aprovação contra os anexos 1–4. As capturas automáticas por etapa não são, sozinhas, um teste de equivalência visual.
- Matriz física Safari/iOS/WebView, Android, Windows Intel/AMD/discreta, macOS e aceleração desativada; cache frio/quente, rede lenta, economia de bateria e service worker.
- Medições de FPS, ausência de leaks e downloads duplicados em todas essas classes.
- Fallback canônico pré-renderizado para indisponibilidade real de WebGL. **O CSS emergencial ainda existe** para falhas terminais; não é considerado visualmente equivalente nem uma alternativa aprovada ao contrato.
- Regressão visual T0–T5 com referências aprovadas e assertions de navegador mais abrangentes; o script atual coleta screenshots/telemetria e seu exit code não certifica todos os critérios de aceitação.

Não marcar os critérios de aceitação dos aparelhos reais como concluídos com base apenas em emulação de viewport, testes unitários ou sucesso de build.
