Diagnóstico de implantação (somente leitura) — nada foi alterado

## Confirmado
- Projeto Lovable ligado ao backend btfaumhroqtqzxomqorx (o mesmo que atende preview e o site publicado).
- O código deste projeto está no HEAD 9f01dcd1, igual à base que você informou. O repositório local é o espelho interno do Lovable, sincronizado com o GitHub leomateus620-pixel/expo-logistics-hub (o branch sincronizado é o main).
- Funções de bot existentes: workers-orchestrator, workers-actions, workers-routines. A função workers-commercial-reports ainda não existe aqui nem no supabase/config.toml.
- Últimas migrações registradas no Drizzle: 0026_commercial_sales_analytics. As suas 20261023140000/150000/160000 foram aplicadas por fora e não aparecem no diário do Drizzle (esperado; não vou reaplicar).
- Da sandbox, a API pública do GitHub responde 200 para o repositório, mas o branch `codex/bot-commercial-reports` retornou 404: ele ainda não foi enviado ao GitHub, ou o nome está diferente.

## Mecanismo de implantação
- A única forma é a ferramenta de implantação de funções do Lovable Cloud (deploy_edge_functions). Ela recebe só nomes de função e publica os arquivos que estão no workspace do projeto (`supabase/functions/<nome>` mais `_shared`). Ela não aceita um SHA nem um branch.
- Por isso, o fluxo seguro depois que você mandar o SHA é:
  1. Baixar, só leitura, os arquivos daquele SHA pela API pública do GitHub, para /tmp. Nada é feito no main, no GitHub ou com git.
  2. Comparar com o workspace e copiar apenas os caminhos revisados (`supabase/functions/workers-orchestrator/**`, `supabase/functions/workers-commercial-reports/**`, os `_shared/workers/**` necessários e a entrada `[functions.workers-commercial-reports] verify_jwt = true` no config.toml). Também conferir o SHA-256 de cada arquivo.
  3. Rodar `deno check` nas duas funções e implantar só essas duas.
  4. Smoke test: sem token → 401; usuário sem `ai_workers_can_access` → 403; sessão autorizada → resposta válida. Ler os logs das funções.
- Ponto de atenção: o passo 2 grava arquivos no workspace do Lovable, e o Lovable sincroniza commits com o main do GitHub. Implantar o código exato do SHA sem tocar no main não é possível. Ficaria um commit no main com esses arquivos, sem mudar o frontend publicado. Se você não quiser isso, a alternativa é primeiro fazer o merge da PR no main e eu implantar a partir do main sincronizado.

## Pendências antes da implantação
- Enviar o branch ao GitHub (ou corrigir o nome) e informar o SHA completo.
- Escolher: (a) aceitar o commit gerado no main pelos arquivos das funções, ou (b) fazer o merge da PR antes.
