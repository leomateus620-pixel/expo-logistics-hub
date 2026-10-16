# Correção de empacotamento do registry na Edge

O deploy da base pelo Lovable não inclui `src/` no pacote Edge. A importação original da função apontava para a fonte canônica fora do pacote; a ativação falhou após aplicar as duas migrations existentes. Esta correção muda somente o empacotamento, sem nova migration ou regra de negócio.

`scripts/workers/build-edge-registry.mjs` gera `supabase/functions/_shared/workers/generated/read-tools.js` a partir das três exports necessárias de `src/lib/workers/index.ts`, com esbuild resolvido pela dependência do Vite já instalado. O artefato é JavaScript ESM gerado, com `zod` externo pelo import map Deno existente. A declaração `read-tools.d.ts` também é extraída automaticamente dos tipos e assinaturas canônicos pela API do TypeScript já instalado; `@ts-self-types` preserva a tipagem para o Deno. Nenhum arquivo gerado é fonte editável de regras; MCP e app continuam usando o registry canônico.

```sh
node scripts/workers/build-edge-registry.mjs
node scripts/workers/build-edge-registry.mjs --check
```

O header registra SHA256 dos inputs canônicos e um hash agregado que também inclui script, configuração e versão do esbuild. `--check` recompila em memória e compara o conteúdo inteiro; arquivo ausente/desatualizado falha sem escrever ou criar diretórios. Executar a verificação antes de qualquer deploy que inclua os bots. O teste dedicado também integra essa verificação à suíte Vitest existente, sem alterar scripts ou dependências do projeto.

O teste de runtime importa o artefato e cobre paridade com a fonte, JWT ausente/service role, org incorreta, revogação de capability, mascaramento, citações, schema estrito e ferramentas proibidas. Deno check valida a resolução do pacote Edge; o código tipado canônico permanece sujeito ao typecheck do projeto. Não tratar JavaScript gerado como nova implementação TypeScript independente.

A preferência de execução da Fase 3 foi confirmada por Leonardo: executar com o app aberto e recuperar pendências ao entrar. Não há promessa de execução offline nem autorização para persistir tokens.

Validação local concluída em 16/10/2026, antes de integrar alterações posteriores de `origin/main`:

| Verificação | Comando executado | Resultado |
|---|---|---|
| Sincronização | `node scripts/workers/build-edge-registry.mjs --check` | PASS, sem escrita; SHA256 `e1c4f6d3fdf6988526ede48adf7605831d709272a7e312dc58a9ab8a31639544` |
| Runtime/paridade/sincronização | `node node_modules/vitest/vitest.mjs run src/lib/workers/__tests__/edgeRegistry.test.ts src/lib/workers/__tests__/registry.test.ts --maxWorkers=2 --testTimeout=60000` | 2 arquivos, 84 testes passaram: 14 do artefato e 70 canônicos |
| Tipos do projeto | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | PASS |
| Lint dos arquivos da correção | `node node_modules/eslint/bin/eslint.js scripts/workers/build-edge-registry.mjs src/lib/workers/__tests__/edgeRegistry.test.ts supabase/functions/_shared/workers/generated/read-tools.js supabase/functions/_shared/workers/generated/read-tools.d.ts supabase/functions/workers-orchestrator/index.ts` | PASS, sem diagnósticos |
| Deno na árvore do projeto | `/tmp/fenasoja-workers-deno/package/deno check --config supabase/functions/workers-orchestrator/deno.json supabase/functions/workers-orchestrator/index.ts` | PASS |
| Deno com pacote isolado | Cópia apenas de `supabase/functions` para diretório temporário, seguida do comando abaixo | PASS, `src/` ausente |

O `node` foi o runtime disponível em `/Users/leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; Deno 2.9.6, esbuild 0.21.5 e TypeScript do projeto 5.8.3. Logs: `/tmp/fenasoja-edge-registry-tests.log`, `/tmp/fenasoja-edge-registry-sync.log` e `/tmp/fenasoja-edge-registry-lint.log`.

Prova isolada: `tempfile.mkdtemp` + `shutil.copytree('supabase/functions', package/'functions')`, excluindo `.env`, `.env.*` e `node_modules`; a asserção `(package/'src').exists()` retornou `False`. O subprocesso abaixo rodou com cwd no pacote temporário e retornou código 0:

```sh
/tmp/fenasoja-workers-deno/package/deno check \
  --config /var/folders/8t/tcm8hqc9167g5yd7dsw4yqf80000gn/T/fenasoja-edge-package-c0qq1r_6/functions/workers-orchestrator/deno.json \
  /var/folders/8t/tcm8hqc9167g5yd7dsw4yqf80000gn/T/fenasoja-edge-package-c0qq1r_6/functions/workers-orchestrator/index.ts
```

O JavaScript gerado ocupa 50.157 bytes e as declarações 2.124 bytes. A correção não altera engine, contrato de ferramentas, capabilities, RPCs/policies de negócio, pacote ou MCP gerado. Não foi feito build Vite para evitar regenerar o MCP sem necessidade. Gerar e verificar o artefato não confirma implantação; não foi executado deploy por esta tarefa.
