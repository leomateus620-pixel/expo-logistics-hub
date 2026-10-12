# Ambiente e reprodução

Host realmente disponível: macOS, Apple M5, 16 GiB de RAM, Chrome 155/ANGLE Metal Apple M5. Alimentação em bateria e lowpowermode=0 registrados; clocks, temperatura, carga de outros aplicativos e cache de shader do driver não controlados. Este host não representa os desktops/Androids afetados. Os testes de viewport/CPU/rede são simulações no mesmo hardware.

Base de código e build: `8f3e871010ebfeab45824ba042183127da3b15e3`. Candidato de código/build comparado: `38aff99abd08261e7523a1855ca074ff1c350008`. Ambos os builds de produção QA servem `/qa-build-manifest.json` com esses valores. Commits posteriores de documentação/harness não alteram o runtime comparado. O HTML público observado declara a base; não houve comparação criptográfica dos bundles publicados.

O checkout principal permaneceu limpo. Trabalho em `codex/map-constrained-devices`, worktree `/Users/leonardo/.codex/worktrees/map-constrained-devices/expo-logistics-hub`; baseline separada em `/private/tmp/fenasoja-map-baseline`. Os arquivos de teste copiados à baseline servem exclusivamente à reprodução das falhas; seu código de aplicação não foi editado.

## Dependências e build

Node 24.19.0 e npm 11.12.1. `npm ci --ignore-scripts --no-audit --no-fund` falha na base porque faltam Drizzle/Postgres e dependências transitivas no lock. Foi feita instalação **fora dos dois checkouts**, copiando package.json/lock para `/tmp/map-device-deps`, seguida de `npm install --ignore-scripts --no-audit --no-fund`. Os dois checkouts compartilham esse mesmo node_modules por symlink. Não se alterou package.json, package-lock.json ou Bun locks na PR.

Grafo efetivamente usado: Three 0.170.0, R3F 8.17.10, drei 9.122.0, three-stdlib 2.36.1, React 18.3.1 e postprocessing 6.37.8. Lock versionado SHA-256 `8b60cd01f4928985036dda3b7f029daf5d86a36d550ce9f47b43d671710eedcb`; lock temporário reparado `2c33c76132b98269ab9c9530354e774c18cdbb352193628b9fb2469d3334cf22`. A divergência de instalação permanece preexistente; não foi escondida. Registrar um novo grafo se as dependências forem reinstaladas.

Build normal `npm run build -- --manifest` e `npm run typecheck` passaram, incluindo o gate final da fila. O build normal não contém rotas de diagnóstico. O plugin MCP do Vite pode regenerar `supabase/functions/mcp/index.ts`; o arquivo foi comparado com a cópia anterior e permaneceu idêntico. Nenhum deploy ocorre no script build. Avisos de chunks grandes/Browserslist estão registrados e não foram silenciados.

## Iniciar os builds comparáveis

Com as dependências acima disponíveis, execute a partir do worktree candidato. Um shell com Node/npm instalados pode usar `node` e `npm`; neste host o Node fornecido pelo app fica no caminho abaixo:

```sh
cd /Users/leonardo/.codex/worktrees/map-constrained-devices/expo-logistics-hub
MAP_NODE=/Users/leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
MAP_QA_ROOT=/private/tmp/fenasoja-map-baseline MAP_QA_OUT=/private/tmp/fenasoja-map-qa/base "$MAP_NODE" node_modules/vite/bin/vite.js build --config scripts/constrained-devices/qa.vite.config.ts
MAP_QA_OUT=/private/tmp/fenasoja-map-qa/candidate "$MAP_NODE" node_modules/vite/bin/vite.js build --config scripts/constrained-devices/qa.vite.config.ts
```

A configuração específica reutiliza a divisão de chunks normal e a fixture existente. Substitui apenas plugins de build/diagnóstico, backend por `https://qa.invalid`, envDir sem `.env` e analytics da **preview** para alcançar a dashboard real. A aplicação e as regras de produção não recebem novas permissões. O backend indisponível não é tratado como inventário: somente as rotas QA usam os dados oficiais de referência em memória.

Inicie em dois terminais, um servidor por terminal:

```sh
MAP_QA_PORT=4241 "$MAP_NODE" scripts/constrained-devices/serve.cjs /private/tmp/fenasoja-map-qa/base
MAP_QA_PORT=4242 MAP_QA_HOST=0.0.0.0 "$MAP_NODE" scripts/constrained-devices/serve.cjs /private/tmp/fenasoja-map-qa/candidate
```

O default escuta somente loopback; `MAP_QA_HOST=0.0.0.0` habilita explicitamente acesso LAN. A porta 4242 foi iniciada assim para permitir teste físico autorizado. Endereços deste host durante a tarefa:

- Base: http://127.0.0.1:4241/__dev/commercial-map-interface?qualityQa=HIGH
- Candidato: http://127.0.0.1:4242/__dev/commercial-map-interface?qualityQa=HIGH
- Mesmo candidato em outro aparelho na mesma rede: http://192.168.0.109:4242/__dev/commercial-map-interface?qualityQa=HIGH
- Renderer com probe existente: `/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&qualityQa=HIGH`.
- Preview adicional da revisão Exporural 2028: acrescente `&exporural2028` ao renderer. A fixture padrão não representa o inventário comercial atual consultado no banco.

O IP LAN pode mudar. Reconfira com `ipconfig getifaddr en0`. Para comparar no aparelho físico, sirva também a base com o mesmo `MAP_QA_HOST=0.0.0.0` em outra porta e use a mesma URL/câmera/qualidade/viewport, alternando uma cena viva por vez. Remova `qualityQa=HIGH` somente para a comparação adaptativa separada. A fixture não autentica nem valida comissão/links públicos/Vendas; esses cenários exigem o [staging separado](local-staging.md).

Cada servidor entrega CSP que impede conexões externas, formulário e iframe, aceita somente GET/HEAD e não oferece proxy/API. Assets hashed têm cache HTTP por uma hora; HTML permanece no-cache. O harness funcional bloqueia também rede não-loopback/métodos de escrita; o benchmark usa bloqueio CDP+mesma CSP para preservar o cache HTTP, pois interceptar rotas Playwright desabilita esse cache. Nenhuma conexão/Storage/Function de produção é usada.

## Parar

Use **Ctrl+C** nos dois terminais. Quando iniciados por automação, encerre apenas os processos identificados para esse ambiente:

```sh
lsof -nP -iTCP:4241 -iTCP:4242 -sTCP:LISTEN
kill -TERM <pid-do-servidor-base> <pid-do-servidor-candidato>
```

Não é preciso limpar pastas, resetar Git ou remover dados de usuário. Os builds são arquivos locais. O staging Supabase não foi iniciado neste host e, portanto, não há containers/banco/Storage a desligar.

## Comparações e aparelhos físicos

Executar `boot-compare.cjs` e o harness de navegação somente sem build/testes/outro benchmark concorrentes. [Critérios](acceptance.md), [percurso funcional](functional-harness.md) e relatório principal definem cenários/proveniência/limitações. Cold significa novo contexto e cache HTTP do navegador explicitamente limpo; não significa cache frio do driver. Warm é reload no mesmo contexto, preservando os caches registrados.

Na matriz física, anote modelo de aparelho/navegador/GPU quando disponível, viewport/buffer/DPR, fonte de energia/rede, câmera/modo/inventário, abertura e controles, p50/p95/p99 ativo/stalls, perda de contexto e sessão de 15–30 min. Inclua desktops integrados antigos, RAM alta/GPU limitada, Android de entrada/intermediário, aparelho saudável e iPhone/Safari. Não usar resultados deste Mac, viewport móvel ou CPU 4× para preencher essas linhas.
