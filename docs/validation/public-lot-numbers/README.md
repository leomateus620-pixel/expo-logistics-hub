# Numeração nos mapas públicos externos

## Comportamento

- `publicAreaRegistry.ts` habilita a camada nas três rotas `/areas/:slug/:token` de Exporural, ICS externo e Espaço do Automóvel. `PublicAreaMapPage.tsx` encaminha ao Canvas o inventário autorizado com slug e tipo de escopo correspondentes.
- A camada cruza lotes e geometrias pelo `entityId`. Exibe o `lotNumber` oficial como texto e usa os estados de `publicAvailability.ts`. O ponto cadastral fica no interior do lote, inclusive em polígonos côncavos com vazios. Na Exporural, a âncora oficial tem preferência quando está no interior.
- A plaquinha tem tipografia de 12 px, altura de 18 px CSS e largura calculada pelo texto. A legenda reúne o acabamento do terreno e a placa em cada estado. O ponto verde identifica disponível, a placa neutra identifica vendido e o traço identifica bloqueado.
- O retângulo horizontal é projetado de volta ao plano do lote e precisa caber inteiro no polígono. Os lotes comuns ganham placa quando sobram 3 px por lado e a conservam com 1,5 px. Para a seleção, as margens são 1 px e 0,5 px. As caixas ficam a pelo menos 2 px da borda da janela e têm um intervalo de colisão de 3 px.
- A placa selecionada reserva espaço primeiro. Os nomes de empresas ficam antes das demais placas na vista geral. Se uma placa de um membro disputar espaço com o nome do grupo em detalhe, o nome cede quando um retângulo de 1,9 vez suas dimensões cabe naquele lote. A regra de detalhe permanece até 1,55 vez. Os contornos do grupo continuam na cena. As outras placas entram na ordem disponível, vendido e bloqueado, com desempate pelo `entityId`. Rótulos territoriais conflitantes cedem espaço na mesma projeção.
- A camada usa um atlas e uma draw call instanciada. A profundidade de cada pixel segue o plano do lote, permitindo que a cena oculte placas. A geometria da placa acompanha a projeção da âncora e mantém a orientação horizontal na tela.

## Inventários autorizados no preview

| Área | Lotes | Sem número oficial | Sem geometria |
| --- | ---: | ---: | ---: |
| Exporural | 108 | 1 | 0 |
| ICS externo | 105 | 0 | 0 |
| Espaço do Automóvel | 64 | 0 | 0 |

A área de 568,78 m² da Exporural, `EXPORURAL-AREA-56878`, tem `lotNumber` nulo. Segue na lista e na ficha pelo nome oficial. Se houver numeração oficial no futuro, basta preencher o campo cadastral existente para a mesma entidade.

## Capturas

As capturas usam geometria e números reais dos inventários autorizados. O navegador substituiu os nomes das empresas por aliases durante a geração das imagens. As capturas registram apenas a área da página.

| Área e vista | Antes | Depois |
| --- | --- | --- |
| ICS externo, vista geral no desktop | [Antes](ics-geral-antes.webp) | [Depois](ics-geral-depois.webp) |
| ICS externo, terceira aproximação no desktop | [Antes](ics-zoom-antes.webp) | [Depois](ics-zoom-depois.webp) |
| Exporural, terceira aproximação no desktop | [Antes](exporural-zoom-antes.webp) | [Depois](exporural-zoom-depois.webp) |
| Espaço do Automóvel, segunda aproximação no celular | [Antes](automovel-mobile-antes.webp) | [Depois](automovel-mobile-depois.webp) |

Três vistas do ICS externo registram a orientação das placas durante a órbita. [De cima](ics-vista-superior.webp) · [Inclinação inicial](ics-orientacao-inclinada.webp) · [Inclinação oposta](ics-orientacao-oposta.webp).

## Resultado dos testes

- Os três links foram validados no preview local em Chrome com WebGL 2 e ANGLE Metal em Apple M5. A matriz cobriu a vista geral e a lista em desktop, celular emulado e desligamento forçado do WebGL. A lista expôs o número e o estado por botões acessíveis e abriu e fechou a ficha pelo teclado.
- Os gestos passaram nos três slugs em desktop e celular emulado. Foram testadas três aproximações, órbita de cima, duas inclinações opostas, pan, clique ou toque no centro da plaquinha e atualização para bloqueado com o mesmo Canvas, câmera e renderer. A simulação de revogação removeu o Canvas. A versão base lançava um erro ao tentar liberar uma geometria de vegetação ausente na cena pública. A limpeza agora ignora esse recurso opcional.
- No ICS externo em desktop, a vista geral ficou com 0 placas, a segunda aproximação mostrou 12 e a terceira mostrou 37. A inclinação oposta mostrou 61. A verificação comparou cada placa com o texto e o estado retornados pela RPC e conferiu caixas dentro da janela, sem duplicatas ou colisões. As capturas confirmaram a orientação horizontal e o encaixe no lote.
- A fixture `scripts/pavilion-plan-qa.html` verificou a cena de gestão, a saída para o exterior e o Pavilhão 3 público antes e depois. Nenhum desses contextos montou a camada nova. A suíte de escopo também verificou os outros pavilhões, troca de link, revogação, entidade fora do inventário, lotes do mesmo grupo e números como `007-A`.
- `npm run build`, `npm run typecheck` e os 115 testes focalizados passaram. A suíte integral manteve as mesmas 87 falhas identificadas na base `d5d525cd`, sem novos casos com falha.

Tempo de quadro P95 durante as três aproximações medidas pelo diagnóstico do Canvas. Cada execução desktop registrou 30 quadros ativos. Os resultados descrevem este ambiente de preview.

| Área | Desktop antes | Desktop depois | Celular emulado antes | Celular emulado depois |
| --- | ---: | ---: | ---: | ---: |
| Exporural | 17,2 ms | 17,3 ms | 16,9 ms | 17,3 ms |
| ICS externo | 17,6 ms | 17,4 ms | 17,4 ms | 17,6 ms |
| Espaço do Automóvel | 16,7 ms | 17,3 ms | 17,5 ms | 17,2 ms |

## Reprodução

Use `QA_LINKS` com um arquivo local fora do Git no formato `{slug: token}` e aponte `PLAYWRIGHT_MODULE` para o Playwright quando ele estiver instalado fora do projeto. O preview foi executado localmente a partir do build de produção.

```sh
VITE_COMMERCIAL_MAP_DIAGNOSTICS=true npm run build
npm run preview -- --host 127.0.0.1 --port 5188
```

```sh
QA_PHASE=after QA_SAVE_PAYLOADS=0 node scripts/public-map-matrix-qa.cjs
QA_PHASE=after QA_MOBILE=1 QA_SAVE_PAYLOADS=0 node scripts/public-map-matrix-qa.cjs
QA_PHASE=after QA_NO_WEBGL=1 QA_SAVE_PAYLOADS=0 node scripts/public-map-matrix-qa.cjs
QA_LOT_NUMBERS=1 QA_LOT_NUMBER_REVISION=1 QA_ALIAS_COMPANIES=1 node scripts/public-map-gestures-qa.cjs
QA_MOBILE=1 QA_LOT_NUMBERS=1 QA_LOT_NUMBER_REVISION=1 QA_ALIAS_COMPANIES=1 node scripts/public-map-gestures-qa.cjs
```

Defina `QA_BASE=http://127.0.0.1:5188` para as duas famílias de scripts. `QA_LOT_NUMBER_REVISION=1` simula uma alteração para bloqueado e uma resposta de revogação interceptando as RPCs no navegador. Os scripts interceptam a telemetria. `QA_MOBILE=1` usa viewport de 390 × 844, eventos de toque e pinch no Chromium. Os ensaios de desktop usam 1365 × 768.
