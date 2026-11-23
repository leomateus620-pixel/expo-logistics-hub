# Aparência do parque em build de produção

A base é `c99436b37d91971ef86b8a76f0177d0d0427e4d9`. A matriz principal e a galeria pareada usam a revisão candidata `ff8f8360934034909ab82b491949ec82579d0ea9`. A alteração subsequente de visibilidade da Árvore Lunar está em `1db33c820d1a8e65b40b169a3c24ff9e3b22ac8e`. A galeria com árvores ligadas usa as mesmas superfícies medidas. A revisão `32b68d600df60d0e4ae17d4311ea04a28d8512e5` identifica a arte da placa da Árvore Lunar para conservar sua cor após a chuva. As confirmações de desempenho a seguir identificam cada revisão. O ensaio usa Chrome 157.0.8103.79 no macOS 26.6 (25G72), Apple M5, 16 GB, ANGLE Metal e WebGL 2. O Mac executou as rodadas em bateria, com modo de baixo consumo desativado. Os tempos são de preview em loopback. O celular é uma emulação de viewport/toque e CPU no mesmo Mac. A GPU continua sendo a do M5. Não houve ensaio em telefone físico.

A rota publicada abriu o login em um contexto limpo. Na sessão autenticada existente, a equipe verificou a cena, a opção Isométrica e o painel Camadas com os quatro controles anteriores. A tabela de tempos abaixo vem exclusivamente da fixture pública local. Nenhum ensaio automatizado escreve no banco.

## Comparação visual

Cada imagem mostra a base à esquerda e Natural quente à direita. As cinco primeiras reproduzem a composição dos anexos. Os PNGs enviados contêm pixels, sem telemetria de câmera nem instante exato do amanhecer. As poses reconstruídas têm os mesmos valores numéricos nas duas revisões. A captura tem 1366 × 768 CSS px, DPR 1, nível MEDIUM, dia com progresso 1, tempo seco, árvores e rótulos ativos. A cena noturna tem iluminação estabilizada. Os manifestos incluem posição, alvo, orientação, FOV, camadas, clima, progresso solar, orçamento, buffer, estado de seleção e amostras de material compilado.

| Enquadramento | Ampliação |
| --- | --- |
| Geral | [Visão de entrada](01-geral.webp) |
| Contracampo | [Vista do lado oposto do parque](02-contracampo.webp) |
| Horizonte | [Expo Rural e pavilhões](03-horizonte.webp) |
| Superior | [Implantação e entorno](04-superior.webp) |
| Aproximação | [Pavilhões, copas, ruas e quadras](05-pavilhoes.webp) |
| Chão sob árvores | [Caminho do Bosque junto aos pavilhões](06-bosque.webp) |
| Casa Fenasoja | [Sede B12 na Rua Brasília](07-casa.webp) |
| Interior | [Planta B5](08-interior.webp) |
| Noite | [Pavilhões e iluminação viária](09-noite.webp) |
| Seleção | [Quadra D, lote 01](10-lote.webp) |
| Quadras A/B | [Gramado entre as quadras](11-quadras-ab.webp) |
| Árvore Lunar | [Memorial e clareira](12-arvore-lunar.webp) |
| Fundos | [Estacionamento e linhas de circulação](13-estacionamento.webp) |
| Inspeção interna | [Enquadramento de inspeção B5](14-interior-inspecao.webp) |

A galeria usa a configuração de diagnóstico comercial existente. Ela carrega em memória a implantação Exporural 2028, o registro rural saneado versionado e os estados de controle dos demais segmentos. Um ponto sintético é bloqueado em ambas as revisões. A cena reporta 148 lotes disponíveis, 59 em aberto, 69 vendidos e 1 bloqueado entre os externos elegíveis. As duas cenas respondem ao clique projetado sobre o centro cadastrado de Q-D-01. As referências de cor e material estão na [prancha de materiais](materiais.md).

| Percurso gravado em WebM | Base | Natural quente |
| --- | --- | --- |
| Da visão geral ao lote. Clique real, seguido pelo enquadramento da seleção | [Assistir](base-geral-ao-lote.webm) | [Assistir](candidate-geral-ao-lote.webm) |
| Pelo eixo registrado da Alameda Santa Rosa, a 1,73 m na escala local | [Assistir](base-bosque-aos-pavilhoes.webm) | [Assistir](candidate-bosque-aos-pavilhoes.webm) |

[Manifesto da base](base-cameras.json) · [Manifesto da candidata](candidate-cameras.json)

### Interiores visitáveis

A [galeria de interiores](interiores/README.md) percorre as oito plantas de pavilhões comerciais, os galpões da pecuária, o Espaço Mirante e a sede da Fenasoja. Cada planta tem uma vista de entrada e outra sobre um módulo numerado. Os recortes de B2 e B6 mostram o canto de uma ilha central e a reentrância em L do módulo 36. Nesta galeria interna, os quatro estados são controles de laboratório aplicados apenas ao contexto de navegador descartável. A fixture interna original começa com todos os módulos bloqueados.

## Método de medição

O build Vite de produção ativa `VITE_COMMERCIAL_MAP_DIAGNOSTICS=true` somente para disponibilizar os drivers de laboratório. A abertura usa a fixture pública padrão de `startup-matrix.cjs` com implantação persistida, um contexto novo por rodada, recursos gzip em loopback e cache do sistema/driver conservado. Em cada perfil alternamos a ordem das revisões. A imagem útil corresponde ao primeiro frame apresentado após preparar a cena essencial. O pronto usa o marcador atual `commercial-map-ready`, que exige apresentação efetiva. A resposta visível exige deslocamento mensurável da câmera, avanço de `WebGLRenderer.info.render.frame` e uma oportunidade de composição subsequente em rAF após o gesto. É um limite superior observado no navegador. O tempo da rota inclui a espera entre pronto e o envio do gesto pelo driver. A latência de entrada considera apenas o intervalo que começa em pointerdown.

A emulação de abertura usa 390 × 844, DPR de dispositivo 3, orçamento LOW e CPU 4× mais lenta via CDP. O ensaio de movimento iguala viewport, camadas e DPR entre revisões. Ele aplica a trajetória de órbita de cinco segundos de `navigation-resolution.cjs` após aquecimento e hidratação completa. O cenário desktop de movimento fixa HIGH em 1440 × 900. O cálculo da fluidez considera as janelas de movimento. No ensaio móvel da matriz, o gesto de tempo é um arraste de ponteiro. A validação funcional com toque, pinça e fechamento está descrita separadamente na PR.

O ensaio de prontidão inspeciona o primeiro frame, os controles instalados e a resposta do renderer. A validação de qualidade percorre 20 trocas entre HIGH, MEDIUM e LOW com a mesma cena. [Prontidão, paridade e contagem de recursos](prontidao-e-paridade.json). Antes da correção, oito materiais da calçada da alimentação eram substituídos ao entrar em LOW tanto na base quanto na primeira candidata. [Diagnóstico das instâncias](paridade-calcada.json). A prévia da área externa pública foi aberta com a preferência quente salva e a rede restrita ao servidor local. [Resultado da área pública](publico.json).

### Abertura

Medianas de três visitas por versão, em milissegundos. A coluna final traz o intervalo observado para o pronto.

| Dispositivo de laboratório | Revisão | Imagem útil | Pronto | Rota até resposta visível | Gesto até resposta | Pronto mín–máx |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | Base | 5556 | 5625 | 5830 | 61 | 4956–7510 |
| Desktop | Natural quente | 3626 | 3682 | 3854 | 62 | 2979–4640 |
| 390 × 844 · CPU 4× · LOW | Base | 10400 | 10451 | 10804 | 92 | 10174–10540 |
| 390 × 844 · CPU 4× · LOW | Natural quente | 7925 | 7981 | 8361 | 94 | 7976–8191 |

### Custo de escolher o perfil no mesmo build

Duas visitas frias por perfil (Clássico, Natural quente, Natural quente, Clássico) na mesma revisão candidata. Viewport móvel, CPU 4×, LOW e GPU M5. A amostra é pequena e serve para comparar a escolha local do material.

| Perfil | Pronto por rodada (ms) | Rota até resposta visível por rodada (ms) | Gesto até resposta por rodada (ms) |
| --- | ---: | ---: | ---: |
| Clássico | 8170 / 7938 | 8516 / 8319 | 114 / 108 |
| Natural quente | 7628 / 7437 | 8012 / 7754 | 110 / 61 |

### Caminho crítico

Medianas por visita até o primeiro frame. Construção de cena, worker, geometria e texturas se sobrepõem. A preparação de upload inclui a espera do agendador e a submissão. O navegador permite estimar o tempo de CPU e de driver. O preço de execução física da GPU por textura permanece indeterminado.

| Dispositivo | Revisão | Transferência observada (KiB) | Cena (ms) | Worker B12 (ms) | Geometria instrumentada (ms) | Texturas procedurais (ms) | Shader direto (ms) | Fila de upload (ms) | Programas / texturas |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | Base | 1584 | 2247 | 630 | 8 | 163 | 709 | 1892 | 129 / 115 |
| Desktop | Natural quente | 1592 | 1727 | 746 | 11 | 121 | 691 | 306 | 129 / 111 |
| 390 × 844 · CPU 4× · LOW | Base | 1525 | 6373 | 1054 | 23 | 460 | 782 | 1869 | 129 / 114 |
| 390 × 844 · CPU 4× · LOW | Natural quente | 1533 | 5555 | 1098 | 27 | 379 | 856 | 290 | 129 / 111 |

Na execução diagnóstica com CPU 4× da base, as amostras de V8 atribuíram 562 ms próprios à distância ponto–segmento e 443 ms ao teste de ponto dentro do polígono. O módulo espacial reuniu 1.252 ms próprios. A construção de triângulos também apareceu na pilha do recorte. Estes números pertencem à execução com profiler, separada das três visitas medidas. Os testes de limite espacial e o reuso dos atributos de geometria reduzem o custo de construção da cena. O carregamento das texturas ganha mais de um envio pequeno por intervalo disponível. A barreira de apresentação permanece após a preparação dos recursos essenciais. Os arquivos novos têm decodificação nativa e envio opcional depois do marco de pronto.

### Movimento

As medições abaixo mostram mediana / p95 dos intervalos entre frames dentro de cada órbita. Os dois pares são execuções separadas no mesmo cenário, em ordem AB/BA. A amostra permite inspecionar repetição local e eventuais oscilações.

| Viewport / orçamento | Revisão | Órbita 1 (ms) | Órbita 2 (ms) | Mudanças de resolução durante as órbitas |
| --- | --- | ---: | ---: | ---: |
| 1440 × 900 · HIGH | Base | 33.3 / 34.1 | 33.3 / 45.1 | 0 |
| 1440 × 900 · HIGH | Natural quente | 33.3 / 34 | 33.3 / 34.1 | 0 |
| 390 × 844 · CPU 4× · LOW | Base | 33.3 / 34.3 | 33.3 / 34.2 | 0 |
| 390 × 844 · CPU 4× · LOW | Natural quente | 33.3 / 34.3 | 33.3 / 34.3 | 0 |

P95 descreve os frames destas órbitas. Três partidas não estimam o p95 de abertura de produção. Emulação de CPU conserva a GPU do Mac. [Medições por rodada](medicoes.json)


### Verificação após o ajuste da Árvore Lunar

A revisão `1db33c820d1a8e65b40b169a3c24ff9e3b22ac8e` passou a ocultar o tronco e a copa da Árvore Lunar e a atualizar o mapa de sombras quando a camada de vegetação é desligada. A réplica Apollo XIV continua visível. Nesta rodada confirmatória, as árvores permaneceram ligadas como na matriz principal. O ensaio repetiu uma visita e uma órbita de cada revisão no LOW com CPU 4×. Uma rodada não estima a distribuição de tempos. [Dados da verificação final](confirmacao-final.json).

| Medição | Base | Candidata final |
| --- | ---: | ---: |
| Imagem útil (ms) | 9877 | 6888 |
| Pronto (ms) | 9932 | 6941 |
| Rota até a primeira resposta visível (ms) | 10314 | 7324 |
| Gesto até resposta (ms) | 110.8 | 107.5 |
| Órbita p50 / p95 (ms) | 33.3 / 34 | 33.4 / 34.2 |


### Verificação da revisão enviada

A revisão `32b68d600df60d0e4ae17d4311ea04a28d8512e5` identifica o atlas gráfico da placa para excluí-lo do escurecimento das superfícies molhadas. Nesta verificação final, as árvores permaneceram ligadas e o clima seco como na matriz principal. O ensaio repetiu uma visita e uma órbita de cada revisão no LOW com CPU 4×. Uma rodada não estima a distribuição de tempos. [Dados da verificação final](confirmacao-envio.json).

| Medição | Base | Candidata final |
| --- | ---: | ---: |
| Imagem útil (ms) | 9397 | 7364 |
| Pronto (ms) | 9453 | 7428 |
| Rota até a primeira resposta visível (ms) | 9913 | 7957 |
| Gesto até resposta (ms) | 95.1 | 108.2 |
| Órbita p50 / p95 (ms) | 18.5 / 31.1 | 19.1 / 25.7 |

As três comparações da matriz e as duas rodadas confirmatórias abriram o mapa mais cedo no perfil LOW. Na revisão enviada, a resposta ao gesto isolado levou 13,1 ms a mais e o p50 da órbita subiu 0,6 ms nesta rodada. Os intervalos de latência do gesto na matriz ampliada foram 90–113 ms para a base e 61–127 ms para Natural quente. O p95 da órbita diminuiu na confirmação final. Estas amostras sustentam a melhora de abertura no laboratório e deixam inconclusiva uma diferença pequena de fluidez entre perfis no uso real.

## Custos por superfície

O diagnóstico de `renderBufferDirect` observa somente a câmera principal em uma execução à parte. Cada material ou malha recebe um grupo exclusivamente pelo primeiro nome reconhecido no material, na textura ou nos ancestrais. Malhas sem nome reconhecido entram em “outros”. Todas as chamadas do mesmo lote de instâncias contam como uma submissão. O tempo medido inclui a CPU e as chamadas síncronas ao driver. A duração real da execução de GPU por fragmento e a sobreposição entre folhas não foram isoladas. O JSON inclui tipos de malha e material, mapas, dimensões disponíveis e custo por frame de cada grupo na abertura e no movimento. A identificação cartográfica de qual camada cobre cada superfície aparece no [inventário de materiais](materiais.md). [Base](base-surfaces.json) · [Candidata](candidate-surfaces.json)

## Reprodução

Em cada checkout, execute o build regular de diagnóstico e sirva o resultado localmente. Para os ensaios de tempo, use um único renderer ativo e a mesma versão do navegador. Os resultados brutos extensos dos scripts originais podem ser mantidos em diretório temporário.

```sh
VITE_COMMERCIAL_MAP_DIAGNOSTICS=true npm run build -- --outDir /tmp/park-dist
node scripts/commercial-map-performance/serve-public-preview.cjs /tmp/park-dist 4232
```

```sh
STARTUP_BASE_URL=http://127.0.0.1:4232 STARTUP_CASES=direct STARTUP_ROUNDS=3 \
STARTUP_COMPLETE=0 STARTUP_PRESENTED_GESTURE=1 STARTUP_OUTPUT=/tmp/park-startup \
node scripts/commercial-map-performance/startup-matrix.cjs

BOOT_BASE_URL=http://127.0.0.1:4232 BOOT_EXPECT_READY=1 BOOT_OUTPUT=/tmp/park-boot \
node scripts/commercial-map-performance/boot-readiness.cjs

NAV_HEADLESS=1 NAV_PHASE=compare NAV_REPEATS=2 NAV_SCENARIOS=continuous NAV_VIEWS=overview \
NAV_QUALITY=HIGH NAV_VIEWPORT_WIDTH=1440 NAV_VIEWPORT_HEIGHT=900 NAV_DEVICE_DPR=1 \
NAV_OUTPUT=/tmp/park-nav node scripts/commercial-map-performance/navigation-resolution.cjs
```

Para a emulação de abertura, acrescente `STARTUP_MOBILE=1 STARTUP_TIER=LOW STARTUP_CPU_THROTTLE=4`. Para movimento, ajuste `NAV_QUALITY=LOW NAV_VIEWPORT_WIDTH=390 NAV_VIEWPORT_HEIGHT=844 NAV_DEVICE_DPR=3 NAV_CPU_RATE=4`. A variável `PLAYWRIGHT_MODULE` pode apontar para o caminho de um Playwright instalado com Chrome disponível. A gravação usa a API screencast do Playwright 1.63.

Para a galeria, compile com o plugin de fixture comercial do próprio projeto e sirva o diretório resultante.

```sh
MAP_QA_OUT=/tmp/park-gallery npm run build -- --config scripts/external-status-lines/qa.vite.config.ts
node scripts/commercial-map-performance/serve-public-preview.cjs /tmp/park-gallery 4244
```

```sh
PARK_PROFILE=warm-natural PARK_URL=http://127.0.0.1:4244 PARK_OUTPUT=/tmp/park-views \
node scripts/commercial-map-performance/park-appearance.cjs
```
