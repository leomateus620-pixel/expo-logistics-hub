# Harness funcional/visual local

`scripts/constrained-devices/functional.cjs` é um percurso separado do benchmark de boot/frames. Usa os builds de produção da fixture oficial e somente URLs loopback. Requer o servidor `serve.cjs` com CSP `connect-src 'self'`; além disso intercepta e bloqueia todas as requisições HTTP não-loopback e métodos diferentes de GET/HEAD. Não acessa banco, sessões, links ou serviços externos.

O QA build transforma somente a condição da dashboard em `CommercialMapPage`: `(isPreview || permissions.canViewMapAnalytics)`, igual nos builds base e candidato. Assim a cobertura é exercitada pela dashboard real sobre dados oficiais sintéticos; não demonstra RBAC/analytics de uma conta autenticada. O build normal da aplicação não usa esse config/transform.

Execução sequencial, somente após terminar build/typecheck/testes e outros benchmarks:

```sh
PLAYWRIGHT_MODULE=<caminho-absoluto-playwright> MAP_FUNCTIONAL_URL=http://127.0.0.1:4241 MAP_FUNCTIONAL_LABEL=base MAP_FUNCTIONAL_SHA=<sha-base> <node-runtime> scripts/constrained-devices/functional.cjs
PLAYWRIGHT_MODULE=<caminho-absoluto-playwright> MAP_FUNCTIONAL_URL=http://127.0.0.1:4242 MAP_FUNCTIONAL_LABEL=candidate MAP_FUNCTIONAL_SHA=<sha-candidato> <node-runtime> scripts/constrained-devices/functional.cjs
```

Pode definir `MAP_FUNCTIONAL_MODE=interface` para isolar UI ou `exporural2028` para a amostra adicional já existente; `MAP_FUNCTIONAL_OUT`, `MAP_FUNCTIONAL_CHANNEL` ou timeout de boot; o default usa Chromium do runtime, HIGH fixo e DPR 1. Nenhum flag de software GPU, aceleração ou timer GPU é inserido. Caso exista `/qa-build-manifest.json`, compara seu SHA com o esperado; sem esse artefato, registra SHA observado como desconhecido. SHA informado pelo executor não deve ser confundido com identificação verificada do build.

O relatório registra resultado individual e preserva falhas em vez de encerrar o percurso no primeiro cenário. Causa terminal de preparação é injetada via marcador real do proprietário único de desenho, seguida de invalidações e retry existente. Isso demonstra a admissão/recuperação do estado; não reproduz shader realmente inválido, timeout real ou falha do driver. A baseline pode falhar deliberadamente nessa regressão, e a falha deve permanecer no resultado.

O percurso de interface usa botões reais para busca, filtros, lista→3D, seleção e dashboard. O percurso gráfico usa as actions existentes do store/probe QA compilado para três segmentos, oito pavilhões comerciais, pecuária, mirante e sede; Visita usa evento QA de spawn e teclado real. Resize é emulação no mesmo host. Pointercancel é sintético. Para lostpointercapture, QA estabelece captura nativa explicitamente após o pointerdown e a libera; o OrbitControls instalado usa listeners document e não estabelece captura sozinho. Hidden/retorno usa evento DOM sintético e declara isso; não simula freeze/thaw do SO. Context loss usa WEBGL_lose_context somente na fixture local.

Screenshots são originais no viewport e hashes SHA-256 abrangem arrays de atributos/index/instanceMatrix/instanceColor e identidade/geometria/preço/status oficiais da fixture. Identidades de Canvas/renderer/controle/cena/câmera e poses são comparadas dentro de recuperação/retorno. O hash não compara pixels, materiais, iluminação ou texturas por si só; a inspeção das imagens continua necessária. Transformações animadas e GPU/driver não são certificados pelo hash.

Recursos são deduplicados por objeto/backing buffer ativo da cena. Bytes de CPU contam ArrayBuffers; texturas listam dimensões/formato/tipo/owners e estimativa restrita a formatos conhecidos da versão Three r170 instalada. Formatos desconhecidos, compressão e dimensões ausentes geram estimativa desconhecida. Render targets, recursos de driver/shader, upload e residência VRAM ficam explicitamente não medidos. A contagem de texturas não é chamada de memória em bytes.

A fixture permanece read-only: Vendas múltiplas/checkout, reservas, contratos, parcelas, Storage, comissão autenticada e tokens públicos são cenários indisponíveis nesta execução. Esses itens dependem do [staging isolado](local-staging.md), que não pôde iniciar por ausência de Docker/CLI/PostgreSQL neste host. O percurso não deve receber passes por cenários indisponíveis nem ser usado como prova de fluidez ou dispositivos físicos.
