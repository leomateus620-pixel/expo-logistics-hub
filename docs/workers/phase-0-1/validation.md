# Validação das Fases 0 e 1 — Workers Fenasoja

Data: 16/10/2026, America/Sao_Paulo.

## Execução ampla e controles

Foi executado `npm test` uma vez no worktree dos workers, com as dependências instaladas e o Node fornecido pelo runtime. `npm run lint` foi executado no mesmo ambiente. Não foi executado build nesta verificação, pois o build do projeto regenera o bundle MCP. Nenhuma dívida histórica foi corrigida para tornar os resultados verdes.

O npm usado é o CLI local temporário `/tmp/fenasoja-workers-npm/package/bin/npm-cli.js`, invocado pelo Node do runtime, com seu diretório `bin` no `PATH`. Os scripts são os mesmos do manifesto: `eslint .` e `vitest run`.

| Verificação | Resultado observado |
| --- | --- |
| Vitest completo | Exit 1; **49 arquivos falharam / 360 passaram**; **88 testes falharam / 3.300 passaram**, 3.388 testes em 409 arquivos |
| Lint completo, primeira execução | Exit 1; 1.026 erros e 84 warnings; incluía bundle MCP regenerado e cache da prévia local |
| Lint completo após limpeza do cache e correções dos arquivos de QA | Exit 1; 1.017 erros e 74 warnings; diferença restante restrita ao bundle MCP regenerado |
| Lint final, bundle gerado restaurado | **982 erros e 74 warnings**, idênticos ao controle; arquivos próprios sem diagnósticos |
| Controle de lint sem workers | Snapshot `f656024d67f02c862a9841858ab2d9c45d83cc31`: exit 1; **982 erros e 74 warnings** |
| Registry, após endurecer Interesse | **70 testes passaram**, exit 0 |
| Lint do registry e dos três adapters MCP de leitura | Passou, exit 0 |

O controle foi executado em `/tmp/fenasoja-workers-main-baseline`, snapshot isolado com `node_modules` vinculado à mesma instalação do worktree. Esse controle se refere ao commit fixado acima; não representa automaticamente a ponta atual de `origin/main`.

## Falhas Vitest existentes e regressões

A [pré-validação anterior](../preflight-2026-10-16/baseline-validation.txt), feita no commit `849b0e8d8c02feaea6b771ca911aab525fee6cf7`, registrou 48 arquivos com falhas e 86 testes falhando. A comparação das mensagens `FAIL` do log completo anterior com o log desta execução identificou **os mesmos 86 cenários**, sem remoções, e somente dois cenários adicionais:

- `src/test/commissionPortal.test.tsx` → `CommissionPortalPage > presents Administrador fifth and preserves the Comissões expansion immediately below`.
- `src/test/commissionPortal.test.tsx` → `CommissionPortalPage > keeps the existing anonymous Admin destination and selected module from the fifth card`.

O teste de Comissão foi então executado separadamente no snapshot sem workers: **as mesmas duas falhas foram reproduzidas**, com 21 testes passando. Os hashes de `CommissionPortalPage.tsx` e `commissionPortal.test.tsx` desse snapshot foram conferidos contra `f656024d67f02c862a9841858ab2d9c45d83cc31` e eram idênticos. Portanto esses dois cenários não foram introduzidos pelos workers; a diferença em relação à pré-validação original decorre das bases de código diferentes.

**Nenhuma falha nova de Vitest foi identificada nesta comparação.** A suíte completa continua vermelha por falhas existentes; não deve ser descrita como aprovada integralmente.

## Regressões de Agenda, links públicos, push e Google Calendar

Todos os sete arquivos direcionados passaram dentro da execução completa, totalizando **71 testes**:

| Arquivo | Testes aprovados |
| --- | ---: |
| `src/lib/__tests__/cronogramaRpc.test.ts` | 16 |
| `src/test/publicMapHost.test.ts` | 6 |
| `src/test/eventAssignmentPush.test.ts` | 3 |
| `src/test/pushDeviceRevocation.test.ts` | 4 |
| `src/test/eventPushMessage.test.ts` | 4 |
| `src/test/googleCalendarState.test.ts` | 27 |
| `src/test/googleCalendarWidget.test.tsx` | 11 |

Esse resultado cobre os contratos automatizados existentes desses arquivos. Não constitui teste de entrega real de FCM nem sincronização real com uma conta Google.

O [orquestrador](../../../src/test/workersOrchestrator.test.ts) passou em 21 testes na execução completa; o [registry](../../../src/lib/workers/__tests__/registry.test.ts) passou nos 69 testes presentes naquele momento. Após acrescentar o gate comercial explícito ao Interesse, o registry foi reexecutado com **70 testes aprovados**. A execução completa não foi repetida; verificações posteriores de arquivos modificados são direcionadas.

## Lint: origem das diferenças

A primeira execução completa apresentou 44 erros e dez warnings a mais que o controle fixado:

- Bundle gerado `supabase/functions/mcp/index.ts`: 35 erros adicionais líquidos depois de ser regenerado pelo build.
- Cache gerado de dependências da prévia: sete erros e nove warnings, em `scripts/workers/.cache/deps`.
- Arquivos próprios da prévia e API: dois erros e um warning, corrigidos pelos respectivos responsáveis.

Após mover o cache para `node_modules/.cache`, corrigir os arquivos de QA/API e reexecutar o lint completo, todos os diagnósticos fora do bundle MCP ficaram **idênticos aos do controle**, incluindo arquivo, linha e mensagem. O único delta restante nessa execução era o bundle gerado: 42 diagnósticos no arquivo regenerado em comparação com sete no arquivo original, diferença líquida de 35 erros. O arquivo gerado deve ser restaurado após o último build; não integra a implementação manual dos workers.

Os 982 erros e 74 warnings da base não são atribuídos a esta entrega e não foram corrigidos. O [levantamento anterior](../preflight-2026-10-16/baseline-validation.txt) havia registrado 1.010 erros e 96 warnings em outra base; esses totais não são intercambiáveis com os do controle `f656024d`.

## Evidências locais e limites

Logs salvos fora do repositório, sem credenciais:

- `/tmp/fenasoja-workers-final-tests.log`: execução completa desta validação.
- `/tmp/fenasoja-workers-final-lint.log`: primeira execução completa de lint.
- `/tmp/fenasoja-workers-final-lint-after-qa.log`: lint completo após correções de QA e limpeza do cache.
- `/tmp/fenasoja-workers-main-lint.log`: controle de lint do snapshot fixado.
- `/tmp/fenasoja-workers-main-commission-portal.log`: reprodução das duas falhas extras no controle.
- `/tmp/fenasoja-workers-final-registry.log`: 70 testes do registry após o gate adicional.
- `/tmp/fenasoja-workers-final-registry-lint.log`: lint aprovado do registry e adapters MCP de leitura.
- `/tmp/fenasoja-workers-failure-scenarios.json`: comparação dos 86 cenários anteriores com os 88 desta execução.

A [evidência de RLS em PostgreSQL isolado](rls-validation.json) é uma verificação separada das novas migrations com identidades e dados sintéticos. Ela não demonstra isolamento das policies de negócio no Supabase implantado. Esta validação ampla não usou sessão de produção, não leu dados de negócio e não publicou código, migrations ou Edge Functions.

Typecheck, build, validação visual e auditoria de acessibilidade são registrados pelo relatório geral da entrega; não foram repetidos nesta subtarefa.

## Verificações finais específicas

Os 134 testes específicos das seis suítes de bots passaram:70 registry, 21 orquestrador, 16 API SSE, 10 hook/histórico e 17 UI/mascotes. Typecheck global e build Vite passaram. ESLint dos arquivos próprios (feature, registry, adapters, launcher, backend e harness) passou sem diagnósticos. Deno check e ensaio SQL com42 statements de assertions passaram. Os logs finais estão em `/tmp/fenasoja-workers-final-focused.log`, `/tmp/fenasoja-workers-typecheck-final.log`, `/tmp/fenasoja-workers-build-final.log`, `/tmp/fenasoja-workers-scoped-lint-final.log` e `/tmp/fenasoja-workers-lint-final-restored.log`.
