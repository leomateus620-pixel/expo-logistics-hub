# Cobertura integral da apresentação externa da ExpoRural

## Diagnóstico demonstrado

Base local e `origin/main`: `68a1140f7415186a454176c0a53b6b3816801e23`. O JavaScript publicado em `https://fenasojagestao.com/` também incorporava esse commit na inspeção de 29/10/2026; veja [deployed-version.json](deployed-version.json).

SELECTs autorizados pelo conector Lovable/Supabase comprovaram que R-59 e R-21 têm `SELLABLE_LOT`, vínculo canônico ativo com ExpoRural, `CommercialLot` ativo, `isCovered=false`, status `SOLD` e metadados de interior nulos, mas **`entity.isSellable=false`**. Esse era o único critério que os excluía. R-40, com flag verdadeiro, é o controle já correto. A prévia anterior utilizou uma proposta de referência com flags de venda ajustados localmente; ela não cobriu o formato cadastral persistido que agora reproduz a falha.

O flag da entidade não é a autorização comercial vigente: a view `commercial_sale_eligibility` permite os lotes disponíveis consultados mesmo quando esse flag é falso; o fluxo operacional já utiliza essa view. O snapshot da revisão de outubro comprova que o atual R-59 era R-52 e já tinha o flag falso. A revisão preservou o campo nos registros retidos e criou novos registros com verdadeiro. Não se atribui a origem inicial de todos os flags falsos à revisão sem evidência histórica adicional.

O predicado anterior rejeitava esses registros antes de chegar aos materiais: `lotColor` mantinha a cor integral, o batch de molduras os excluía e o marcador recebia `confirmation=false`. A captura anterior de R-59 reproduz os três sintomas juntos. A inspeção não identificou uma camada rural integral duplicada ou um cache responsável pela exclusão. Os offsets dos 108 polígonos atuais são válidos; falhas de geometria são conferidas separadamente da elegibilidade.

## Inventário independente

O esperado foi definido pelo vínculo persistido de segmento **do mesmo projeto**, entidade ativa `SELLABLE_LOT`, lote comercial ativo e geometria vigente, sem chamar a função investigada ou filtrar `isSellable`. Não usa faixa de IDs nem o inventário legado como fonte de verdade.

| Conferência | Antes | Depois |
| --- | ---: | ---: |
| Lotes externos ativos esperados | 108 | 108 |
| Reconhecidos | 52 | 108 |
| Excluídos indevidamente pelo flag | 56 | 0 |
| Falhas de derivação de moldura | 0 | 0 |

São 72 lotes de R, 35 de S e um espaço sem número; 92 disponíveis, 3 vendas em aberto e 13 vendidos no momento da leitura. As revisões atuais incluem 68 registros de setembro e 40 de outubro. Os 59 lotes arquivados e as 16 estruturas rurais ativas continuam fora do inventário comercial esperado. Contagens são evidência datada, nunca uma condição fixa no código de produção.

Os [IDs técnicos e motivos dos 56 casos](data-diagnosis.json) e a [fixture sanitizada com os 124 registros cadastrais](../../../src/test/fixtures/ruralCoverageAuthorized.json) preservam a consulta, a data e os valores relevantes. Não incluem compradores, contatos, contratos, pagamentos, tokens ou URLs de logos.

## Correção

- O predicado compartilhado admite o flag falso exclusivamente quando existe relação **canônica de banco com ExpoRural**, classificação externa e lote ativo correspondente à entidade. Os critérios de arquivamento, cobertura e interior continuam obrigatórios. O vínculo divergente lote–entidade também é rejeitado. Relação derivada de prefixo ou metadado não autoriza essa exceção.
- Superfície, divisória, moldura e confirmação continuam usando a mesma política. A geometria é derivada uma vez e reutilizada; o status determina a visibilidade e os buffers existentes. Disponíveis recebem somente o gramado, sem moldura comercial. Bloqueados e estados legados mantêm a regra anterior.
- A RPC pública atual fornece o UUID do segmento e omite `segmentSource`. O adaptador normaliza essa relação usando exclusivamente o escopo rural já autorizado (`SEGMENT`/`SEGMENT_EXTERNAL`), o projeto correspondente e os lotes recebidos. O contexto sem vínculo comercial, outros projetos e demais escopos permanecem intactos. Não há requisição adicional nem alteração de RPC, RLS ou token.
- Diagnóstico local opt-in: `?externalLotPresentationQa=1`, em DEV/build QA. `window.__externalLotPresentationDiagnostics.capture()` expõe critérios com tipos/valores saneados e lê o objeto final: cor, atributo turf, material, batch/instância, visibilidade, moldura e tipo de marcador/logo. Executa sob demanda, sem processamento por frame. A cena normal de produção não instala essa API.

A paleta aprovada permanece idêntica: grama `#739455`, amarelo `#D8BD70`, azul `#8FB7D8`, confirmação `#355F82`; mesma largura/recuo, acabamento, logos, interações, rótulos, paisagismo e iluminação. Não houve escrita em banco, migração, reparcelamento, alteração de situação, preços, compradores, números, áreas oficiais ou geometria cadastral.

## Arquivos de implementação

| Arquivo | Motivo |
| --- | --- |
| `utils/externalLotPresentation.ts` | Corrigir a decisão rural e disponibilizar motivos sem alocar arrays no caminho normal |
| `public/publicMapService.ts` | Normalizar o vínculo do inventário público autorizado |
| `utils/externalLotPresentationDiagnostics.ts` | Conferência local independente e rastreio do objeto renderizado |
| `components/canvas/CommercialMapCanvas.tsx` | Instalar diagnóstico opt-in e associar IDs ao batch |
| `components/canvas/SoldLotLocks.tsx` | Associar IDs às instâncias de logos para inspeção |
| Três testes novos, fixture e mapper em `src/test` | Reproduzir a omissão, exigir cobertura integral e verificar isolamento público/diagnóstico |
| `.github/workflows/commercial-map-spatial.yml` | Executar as novas regressões no CI existente |
| `scripts/rural-coverage` | Prévia e medições reproduzíveis com cadastro atual sanitizado |

## Limites de acesso e ambiente

A leitura real foi cadastral e somente leitura. A validação do renderizador usa uma cópia local desses dados, sem sessão de produção e sem alterar vendas reais. Os demais elementos do parque e os controles ICS/Automóvel utilizam a referência local; seus estados sintéticos são declarados no harness. Não se afirma teste autenticado completo de produção, checkout ou navegação por um token público real.

O público mantém seu contrato de três condições: `SALE_OPEN` e `SOLD` chegam como vendido, portanto exibem a moldura azul sem confirmação de assinatura. O privado preserva amarelo em aberto e azul/check em `SOLD`, inclusive históricos. Nenhum dado privado foi usado para tentar distinguir esses estados no público.

Viewport mobile emulado não substitui teste em Android/iPhone físico. As comparações abaixo registram o ambiente efetivamente utilizado.

## Validação visual e funcional

Chrome headless **156.0.8078.48**, macOS 26.6, Apple M5, WebGL2 via ANGLE Metal. Desktop 1280×800 e mobile emulado 390×844, DPR 1. Os dois builds de produção locais usam a mesma fixture sanitizada, a mesma geometria vigente, as mesmas câmeras, viewport/buffer, iluminação e perfil MEDIUM. O baseline é uma extração imutável de `68a1140f`; o build normal não importa o config de QA.

Passaram **40 capturas pareadas (20 cenários por versão)**: R-59, R-21, R-40, ExpoRural ampla e oblíqua, recortes, ICS, Automóvel, seleção/fechamento, filtro, noite, chuva, mobile e público. Os hashes completos de dados, lotes e geometrias coincidem. As capturas ICS superior, ICS aproximada e Automóvel são **idênticas byte a byte** antes/depois. O [resumo verificável](comparison.json) preserva essas comparações.

| Cena | Antes | Depois |
| --- | --- | --- |
| R-59 / mesma aproximação | [PNG](baseline-medium/r59-close.webp) | [PNG](candidate-medium/r59-close.webp) |
| R-21 / mesma aproximação | [PNG](baseline-medium/r21-close.webp) | [PNG](candidate-medium/r21-close.webp) |
| ExpoRural completa | [PNG](baseline-medium/exporural-top.webp) | [PNG](candidate-medium/exporural-top.webp) |
| ExpoRural oblíqua | [PNG](baseline-medium/exporural-oblique.webp) | [PNG](candidate-medium/exporural-oblique.webp) |
| ExpoRural à noite | [PNG](baseline-medium/exporural-night.webp) | [PNG](candidate-medium/exporural-night.webp) |
| ExpoRural mobile | [PNG](baseline-medium/exporural-mobile.webp) | [PNG](candidate-medium/exporural-mobile.webp) |
| ICS / controle preservado | [PNG](baseline-medium/industry-roads-top.webp) | [PNG](candidate-medium/industry-roads-top.webp) |
| Automóvel / controle preservado | [PNG](baseline-medium/automotive-top.webp) | [PNG](candidate-medium/automotive-top.webp) |

O objeto final confirma **108 superfícies gramadas, 13 molduras azuis/checks e 3 molduras amarelas** no privado; disponíveis não recebem moldura. O público confirma 108 superfícies gramadas, 16 molduras azuis e nenhum check/cadeado. Não há cadeado legado residual nos lotes rurais elegíveis. Os [relatórios completos](candidate-medium/report.json.gz) incluem a identificação técnica, a decisão e os atributos reais de batch/material/instância por estágio; nenhum comprador ou URL de logo é registrado.

O [teste funcional](functional/report.json) exerceu R-59 e R-21 com o flag recebido `isSellable=false`, sem alterá-lo: `AVAILABLE → SALE_OPEN → SOLD → AVAILABLE → BLOCKED → SOLD`. Cor, atributo turf, moldura e marcador foram lidos da cena; o batch e a geometria permaneceram estáveis. A cópia em memória de R-59 recebeu um logo **TEST** local para verificar sua convivência com o check menor; R-21 permaneceu sem logo. Cinco ciclos adicionais preservaram as quantidades de geometrias/texturas após aquecimento. O [toque mobile](functional/r59-mobile-touch.webp) selecionou R-59 através dos adornos.

O harness aguarda o estado efetivo e a imagem carregada, em vez de assumir que um atraso fixo comprova atualização. As chaves QA privadas/públicas são distintas para que a persistência de React Query não restaure um snapshot privado na prévia pública. São ajustes exclusivamente do harness local.

## Checks do projeto

Typecheck e build de produção passaram. A suíte completa final tem **4.060 aprovações e as mesmas 90 falhas do baseline**, sem novas falhas; são 18 testes adicionais. Os 59 testes dirigidos passaram. O [registro dos checks](checks.json) compara nomes/cabeçalhos de falha e os hashes da fonte. As falhas preexistentes incluem contratos/snapshots históricos e uma escrita em `/opt/cursor/artifacts` indisponível neste macOS.

Os scripts de pacote foram executados pelos respectivos binários Node/TypeScript/Vite/Vitest do ambiente, equivalentes a `npm run typecheck`, `npm run build` e `npm test`, sem instalar dependências.

## Reprodução

Usar o mesmo `node_modules` nos dois builds e Chrome/Playwright disponíveis no ambiente. O config usa somente a fixture sanitizada versionada; o host do backend é `qa.invalid` e o servidor de arquivos aceita apenas GET/HEAD. Não é necessário token de produção.

```sh
# Extrair o baseline 68a1140f em diretório separado e disponibilizar node_modules.
MAP_QA_ROOT=/tmp/rural-coverage-baseline MAP_QA_OUT=/tmp/rural-coverage-baseline-dist MAP_QA_REVISION=68a1140f7415186a454176c0a53b6b3816801e23 node node_modules/vite/bin/vite.js build --config scripts/rural-coverage/qa.vite.config.ts
MAP_QA_OUT=/tmp/rural-coverage-candidate-dist node node_modules/vite/bin/vite.js build --config scripts/rural-coverage/qa.vite.config.ts
# Manter cada servidor em um terminal.
MAP_QA_PORT=4251 node scripts/constrained-devices/serve.cjs /tmp/rural-coverage-baseline-dist
MAP_QA_PORT=4252 node scripts/constrained-devices/serve.cjs /tmp/rural-coverage-candidate-dist
```

```sh
LOT_QA_LABEL=baseline LOT_QA_URL=http://127.0.0.1:4251 node scripts/rural-coverage/visual.cjs
LOT_QA_LABEL=candidate LOT_QA_URL=http://127.0.0.1:4252 node scripts/rural-coverage/visual.cjs
node scripts/rural-coverage/functional.cjs
# Rodar isoladamente: sem build, testes ou outro browser QA concorrente.
node scripts/rural-coverage/performance.cjs
LOT_QA_QUALITY=LOW LOT_PERF_OUTPUT=docs/validation/rural-coverage/performance-low node scripts/rural-coverage/performance.cjs
node scripts/rural-coverage/summarize.cjs
```

Quando Playwright não estiver no `node_modules` local, definir `PLAYWRIGHT_MODULE` para sua instalação. Os scripts exigem URLs loopback. As capturas adicionais e JSONs originais de cada repetição podem ficar em arquivo local; a seleção versionada e os relatórios gzip preservam os dados de revisão.

## Desempenho final

Foram **48 repetições válidas e 11.520 amostras de frame**, nas ordens baseline/candidato/candidato/baseline dos perfis MEDIUM e LOW. Cada montagem usa dois gestos de aquecimento de 4 s, com repouso entre eles, e três rotações medidas de 5 s. O diagnóstico existente retém os últimos 240 frames ativos por gesto; não se confunde essa amostra limitada com todos os frames da execução. Nenhuma amostra excedeu 50 ms. A mediana usa a média dos dois valores centrais quando a contagem é par; p95 nearest-rank.

| Perfil / caminho | Frame mediano antes → depois | p95 antes → depois | Draw calls medianas | Triângulos medianos |
| --- | --- | --- | --- | --- |
| MEDIUM / privado | 16,7 → 16,7 ms | 18,0 → 18,1 ms | 616 → 615 | 732.064 → 731.042 |
| MEDIUM / público | 16,7 → 16,7 ms | 17,8 → 18,2 ms | 570 → 569 | 363.146 → 361.386 |
| LOW / privado | 16,7 → 16,7 ms | 17,5 → 17,4 ms | 616 → 615 | 732.064 → 731.042 |
| LOW / público | 16,7 → 16,7 ms | 17,1 → 17,4 ms | 570 → 569 | 363.146 → 361.386 |

A mediana permaneceu estável. O p95 privado mudou entre −0,1 e +0,1 ms; no público houve aumento observado de +0,3 a +0,4 ms. Não se afirma regressão zero nem ganho causal a partir de pequenas diferenças. As distribuições e repetições completas estão em [comparison.json](comparison.json) e nos relatórios [MEDIUM](performance/report.json.gz) e [LOW](performance-low/report.json.gz).

O marcador de abertura `documentToInteractiveMs` mede preparação essencial, controles instalados e frames apresentados. Não equivale a autenticação/dados remotos/checkout concluídos. Há somente **n=2 montagens por versão/perfil/caminho**, amostra exploratória:

| Perfil / caminho | Baseline, por montagem (ms) | Candidato, por montagem (ms) | Diferença entre médias |
| --- | --- | --- | --- |
| MEDIUM / privado | 4081 / 4008 | 4057 / 4036 | +2 ms |
| MEDIUM / público | 2232 / 2283 | 2297 / 2283 | +32,5 ms |
| LOW / privado | 3981 / 4021 | 4010 / 4006 | +7 ms |
| LOW / público | 2233 / 2280 | 2301 / 2280 | +34 ms |

A cobertura correta acrescenta 56 polígonos ao batch existente de molduras, sem criar um draw call por lote. A remoção dos cadeados rurais antigos compensa o custo de triângulos e uma chamada nos enquadramentos medidos. As texturas permaneceram em 113 no privado e 99 no público. Programas permaneceram em 244 no privado e passaram de 121 para 120 no público. As geometrias observadas passaram de 587→586 (MEDIUM privado), 586→585 (LOW privado) e 538→537 no público. As cinco alternâncias de estado do teste funcional mantiveram as alocações aquecidas e o mesmo batch, sem reconstrução repetitiva demonstrada.

DPR 1, resolução 1280×800, conteúdo do parque e caminho `direct` foram iguais; nenhuma compensação de qualidade foi aplicada. Os números de geometrias/texturas/programas vêm dos diagnósticos Three.js: são contagens de recursos, **não bytes de VRAM**. Esta rodada não habilitou queries de tempo GPU/CPU; o tempo de frame vem do diagnóstico RAF existente. A emulação de viewport não comprova desempenho em aparelho físico.

## Integridade das evidências

A seleção visual versionada usa **WebP lossless**. Cada arquivo foi decodificado em RGBA e comparado byte a byte com o PNG original: largura, altura, canais e pixels idênticos. Não houve recorte, redimensionamento ou alteração visual. O [índice](evidence-index.json) registra SHA-256 dos originais, dos arquivos WebP, dos pixels decodificados e os caminhos do arquivo local completo. Os relatórios agregados gzip preservam todas as 40 capturas e as 48 repetições; PNGs adicionais e JSONs redundantes por repetição ficam no arquivo local indicado.
