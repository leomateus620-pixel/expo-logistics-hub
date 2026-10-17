# Validação da base pública da Equipe Fenasoja

Revisão de conteúdo: **2026-10-17**, normalizador **1**. Este relatório distingue a validação local da publicação remota. O schema e o seed foram aplicados integralmente em PostgreSQL isolado; **não houve aplicação de migrations, deploy, homologação ou validação com JWT real no ambiente remoto**.

## Ambiente e evidências

- Checkout de trabalho: `C:/Users/Leonardo/.codex/worktrees/workers-knowledge-base/expo-logistics-hub`, criado a partir de `origin/main` no commit `6481952e`.
- Sistema local: Windows/PowerShell; gerador executado com Node **24.15.0**.
- Banco de teste: **PostgreSQL 18.6 / PGlite 0.5.10**, WASM. Papéis `authenticated` e `anon`, RLS, RPCs, migrations e seed reais foram executados; identidade e associação organizacional vieram de fixtures e claims simuladas.
- O workflow vigente `.github/workflows/fenasoja-bots.yml` executou a matriz em PostgreSQL **16.15 nativo** na [CI 39017775353](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/39017775353), commit `2fd968e617695c63f1a115c3d2e0a0a0cd4f0b38`: **51 verificações aprovadas, nenhuma falha**. São 42 consultas e nove ciclos de integração, com schema/seed reais e identidade sintética. Essa evidência é distinta do WASM e não comprova JWT ou operação em produção.
- [Banco e permissões](evidence/db-qa.json): 62 verificações `OK`, mais 17 resultados `OK` do smoke SQL, sem falhas.
- [Busca, motor e persistência](evidence/integration-qa.json): 42 consultas e nove turnos completos, todos aprovados. São oito respostas/esclarecimentos determinísticos sem modelo e um miss com planejador simulado, tokens 31/7 preservados, auditoria e telemetria mínima. Relógio único: `2026-10-17T15:00:00Z`, correspondente a 17/10/2026 em São Paulo.
- [Build](evidence/build.log), [lint global](evidence/lint.log), [testes focados finais](evidence/focused-tests-final.log), [Deno](evidence/deno-check.log) e [execução global de testes](evidence/tests-all.log) preservam as saídas observadas. O log `focused-tests.log` é uma execução intermediária durante edições concorrentes; não é o resultado final.

O runtime PGlite foi usado a partir de `C:/Users/Leonardo/AppData/Local/Temp/fenasoja-bot-qa-dependencies/node_modules/@electric-sql/pglite/dist`. Ele não foi adicionado às dependências da aplicação.

A mesma matriz está integrada ao serviço PostgreSQL 16 da CI por `--pg-module`, usando somente o host loopback e as variáveis de QA já existentes. Ela cria um banco temporário próprio e valida nome/OID antes de removê-lo. Roles globais existentes são verificadas e preservadas. O [relatório nativo observado](evidence/ci-39017775353-integration-pg-qa.json) e a [proveniência do artefato](evidence/ci-39017775353.json) conservam run, commit, versão e SHA-256 sem sobrescrever a evidência WASM. A remoção do banco temporário foi confirmada. Os jobs `bots` e `agenda-restaurant` passaram nesse commit; o estado do head final deve ser consultado na PR.

## Acervo e geração

Os quatro anexos foram lidos integralmente, incluindo os 20 membros do ZIP. As 1.245 linhas/perguntas do CSV Fenasoja e as 10.889 da expandida foram comparadas com seus JSON principais; os oito recortes JSON reproduzem o principal. Cada base é importada uma única vez. Os originais usados, seus nomes, versões, hashes e proveniência estão em [data/kb/raw](../../data/kb/raw/); o [manifesto](../../data/kb/manifest.json) é calculado a partir dos arquivos finais.

| Base | Entradas aplicadas no banco local | Ocorrências de perguntas | Confirmado | Parcial | Conflito | Dinâmico | Sem fonte |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fenasoja | 372 | 1.245 | 258 | 47 | 12 | 0 | 55 |
| Expandida | 2.414 | 10.889 | 2.337 | 63 | 0 | 11 | 3 |
| Total | 2.786 | 12.134 | 2.595 | 110 | 12 | 11 | 58 |

Foram preservadas todas as ocorrências e os IDs; não há unicidade global do texto normalizado. O conjunto tem 12.098 perguntas normalizadas distintas, 4.964 ocorrências de fonte e 677 URLs distintas; a expandida tem 610 URLs. O mapa editorial cobre 17 colisões. O calendário contém 27 registros e a ausência de edição em 2020; 313 entradas Fenasoja têm ano de edição após curadoria, sem impor a contagem hipotética 273.

A curadoria registra **2.564 alterações** e **77 respostas revisadas**. Inclui a extração dos 55 invólucros sem fonte, redação pública dos contatos, separação de links do corpo, substituição visível do símbolo de porcentagem incompatível, reformulação de Pix sem caracteres invisíveis, limpeza de 276 rótulos WordPress, correção gramatical de ED22-NEG com conflito preservado e orientação natural dos dados dinâmicos. AGRO-ENSO-003 deixou de fixar um alerta climático histórico como estado vigente; original e data permanecem na proveniência.

Foram mantidas atribuição/licença e referência de publicação para 479 registros da Wikipédia e 1.525 de livros da Embrapa. Restrições técnicas, jurídicas e de manejo indispensáveis foram convertidas em notas públicas. As sete formas de endpoint SIDRA móvel foram verificadas para o período explícito 2025; 321 ocorrências de URL foram fixadas nesse período, preservando o endereço original. Não se afirma nova revisão factual de todas as publicações: o alcance das consultas primárias consta em [factual-review.json](../../data/kb/raw/factual-review.json) e [period-source-checks.json](../../data/kb/raw/period-source-checks.json).

Schema: `20261017070000_workers_knowledge_base.sql`; espelho Drizzle: `0018_workers_knowledge_base.sql`; seed: `20261017080000_workers_kb_seed.sql`. O seed é uma transação com 56 lotes de entradas e 49 de perguntas, dimensionados pelo gerador. SHA-256 do seed validado:

```text
a891edadfc9464e00cd10354595b935c691b6b2952c7e4bf64c0e51903761e26
```

`build-kb-seed.mjs --check` passou e reproduziu os mesmos bytes. Os **20 testes finais do gerador** passaram em cópia temporária isolada: reprodução, preservação de bytes/mtime, downgrade, timestamp antigo, imutabilidade, contagens, perguntas, URLs, datas, redator, proveniência, curadoria, colisões e orçamento de notas. O último caso acrescentou-se aos 19 iniciais e rejeita quatro notas públicas, reservando cinco posições para interpretação/contexto/status/referência dentro do limite de oito. Um teste adicional do compositor confirmou oito notas preservadas e nove recusadas, sem truncamento. O banco verificou a paridade SQL/JavaScript nas **12.134 ocorrências**, todos os textos exibidos contra o redator SQL e os **2.786 documentos completos** contra os sanitizadores vigentes, com resumo literal preservado.

## Matriz funcional executada

Cada linha abaixo corresponde a uma consulta efetiva em `integration-qa.json`, com o schema e o seed reais. Os IDs são identificadores técnicos de validação, não texto exibido ao visitante. `Sem correspondência` mantém o fluxo anterior; `Esclarecimento` não seleciona uma entrada arbitrária.

| Pergunta executada | Resultado esperado e observado | Estado |
| --- | --- | --- |
| Quem foi o presidente da Fenasoja 2024? | ED24-PRES | OK |
| Qual edição da Fenasoja teve o maior público? | REC-001 | OK |
| Quando foi a décima Fenasoja? | ED10-DATAS | OK |
| Quem presidiu a 10ª edição? | ED10-PRES | OK |
| Quem presidiu a oitava Fenasoja? | HIS-013 | OK |
| Quem presidiu a Fenasoja 1990? | HIS-013 | OK |
| Quem foi o vice-presidente da Fenasoja 2026? | ED25-VICE | OK |
| Quanto dinheiro tem o Plano Safra 2025/26? | MERC-PS-002 | OK |
| Quanto tem o Plano Safra da Agricultura Familiar 2025/2026? | MERC-PS-005 | OK |
| Quanto tem o Pronaf esse ano? | Sem correspondência | OK |
| Qual o percentual de Reserva Legal no RS? | SUST-LEG-004 | OK |
| Quem é o presidente da Fenasoja? | F28-002 | OK |
| Quem será o presidente da Fenasoja 2030? | F28-003 | OK |
| Qual o preço da soja hoje? | MERC-DYN-001 | OK |
| Qual foi o volume de negócios da Fenasoja 2018? | ED22-NEG | OK |
| Qual foi o público da Fenasoja 1966? | ED01-PUB | OK |
| Quando foi a Fenasoja 2024? | ED24-DATAS | OK |
| Teve Fenasoja em 2020? | GER-006 | OK |
| Quanto custa o estacionamento da próxima Fenasoja? | FAQ-GER-004 | OK |
| Qual a altura de pastejo para ovelhas? | Esclarecimento | OK |
| Quantos lotes vendemos em 2026? | Sem correspondência | OK |
| Quais eventos tenho amanhã na agenda? | Sem correspondência | OK |
| O que é Pix? | TEC-WK-0041 | OK |
| Quem será o presidente da Fenasoja seguinte à de 2026? | F28-002 | OK |
| Quem foi a primeira mulher presidente da Fenasoja? | HIS-009 | OK |
| Qual é a população de Santa Rosa em 1990? | Sem correspondência | OK |
| Qual é a população de Santa Rosa em 2025? | SR-002 | OK |
| Quanto tem o Plano Safra da Agricultura Familiar em 2024? | Esclarecimento | OK |
| Qual o PIB do Rio Grande do Sul em 2022? | Sem correspondência | OK |
| Qual o PIB do Rio Grande do Sul? | Sem correspondência | OK |
| Quem não foi o presidente da Fenasoja 2024? | Esclarecimento | OK |
| Quem presidiu a 10ª e a 11ª edição? | Esclarecimento | OK |
| Quem presidiu a décima e a décima primeira Fenasoja? | Esclarecimento | OK |
| 2028 | Sem correspondência | OK |
| Refiro-me à Fenasoja 2028 | Sem correspondência | OK |
| início da gestação | Sem correspondência | OK |
| Por que a Fenasoja não aconteceu em 2020? | GER-006 | OK |
| Quantos habitantes tem Alegria em 2025? | Sem correspondência | OK |
| Quantos habitantes tem Alegria em 2022? | RS-IBGE-POP-4300455 | OK |
| Quando ocorreu a Fenasoja? | ED25-DATAS | OK |
| Quem presidia a Fenasoja? | ED25-PRES | OK |
| Quantos habitantes? | Esclarecimento | OK |

Os testes unitários também cobrem ordinais compostos, ano/ordinal incompatíveis, dias inclusivos de início/fim, abertura conflitante de 2024, virada UTC/São Paulo, fim do calendário conhecido, limiares, preferência entre bases, empates, fase de gestação, várias perguntas, limite de consulta e composição literal de todo o acervo. A suíte `workersKnowledgeBase.test.ts` ampliada passou com **32 testes**.

As regressões adicionais impediram respostas concretamente incorretas encontradas durante a implementação: presidente de 2026 para a edição seguinte; presidente homem no pedido sobre a primeira mulher; população de 2025 para 1990; geografia no lugar de PIB; ciclo 2025/2026 para um pedido de 2024; inversão de negação; apenas a primeira de duas edições; e população de Santa Rosa para Alegria. A solução valida ano próprio, atributo e município antes do corte de candidatos, pede esclarecimento quando necessário e conserva fallback quando falta cobertura. Fragmentos como `2028` não substituem uma pergunta completa por uma correspondência arbitrária.

Os limiares 0,45/0,50, margem entre bases 0,10 e empate 0,02 são **parâmetros iniciais, não uma calibração estatística comprovada**. A matriz fornece evidência de regressão desses casos; não demonstra compreensão irrestrita de qualquer formulação em linguagem natural.

## Persistência, auditoria, uso e permissões

Oito turnos atravessaram busca SQL, `runWorkerTurn`, composição, finalização, leitura persistida e reabertura por nova admissão idempotente. Cobriram resposta confirmada, conflito, sem fonte, dado dinâmico, esclarecimento, edição seguinte, presidência feminina histórica e ciclo incompleto do Plano Safra. Todos mantiveram o bot `mapa` selecionado na fixture, resumo revisado, fontes/datas coincidentes, `ai_messages.state='complete'`, uso 0/0 com modelo determinístico, eventos `tool_completed`/`turn_completed` e um evento KB. Planejador, modelo, ferramenta institucional e web eram dependências que lançavam erro caso chamadas; nenhuma foi usada. A reabertura não repetiu busca nem telemetria.

Essas oito reaberturas comprovam o fluxo persistido local do motor e do banco. Não representam uma conversa aberta com uma sessão real de produção no navegador.

Um nono ciclo cobriu a ausência de correspondência e o fluxo substituto: o planejador foi simulado com uma chamada, sem ferramentas/dados de negócio, e os contadores 31/7 foram preservados. A busca KB concluída gerou auditoria mesmo no miss; o evento auxiliar manteve nulos todos os campos de entrada. A reabertura foi idempotente. Esse cenário usa um segundo usuário autorizado da fixture para respeitar o limite vigente de oito turnos por minuto, sem alterar limites ou timestamps.

Os 62 checks do banco também confirmaram reaplicação idempotente, proteção contra downgrade, preservação de eventos ao atualizar/retirar entrada, detecção de versão trocada antes da finalização e depois dela, recusa de fonte não cadastrada, data inválida, texto incompatível e divergência entre fontes/citações. `sem_fonte` permanece sem comprovação por chip e não aceita desfecho `answered`. Mensagens legadas e contadores reais de tokens conservaram seu comportamento. Extensões já instaladas em `public` foram testadas sem relocalização e com dicionário qualificado.

| Contexto local exercitado | Resultado observado | Limite da evidência |
| --- | --- | --- |
| Usuário autenticado da organização de teste | Conteúdo e busca permitidos; finalização/log do próprio turno aceitos | Claims simuladas, sem JWT remoto |
| Outro usuário autenticado | Conteúdo público legível; eventos alheios invisíveis | Não significa permissão para o menu Equipe |
| Organização/turno alheio | RPC de log recusada | Fixture com vínculo organizacional controlado |
| `anon` | Leitura de conteúdo e RPC recusadas | Papel real PostgreSQL, identidade simulada |
| DML direto por usuário | Recusado | Exercitado fora do contexto administrativo |
| Falta de permissão Equipe no orquestrador | Coberta pelas suítes focadas do orquestrador | Mock do transporte/autorização; JWT remoto não exercitado |

Os testes não usam apenas SQL administrativo como prova de RLS: alternam os papéis de banco e claims. Ainda assim, não foram executadas chamadas remotas com usuários reais autorizado, sem permissão de Equipe e de outra organização. Falta de acesso a essas sessões é uma limitação explícita, não uma etapa manual de liberação do recurso.

## Medições locais

Os tempos abaixo foram medidos no WASM local, com RLS ativo, e estão acompanhados dos planos `EXPLAIN ANALYZE` no JSON do banco. Não são latência de produção nem promessa de SLA.

| Consulta | Mediana | p95 |
| --- | ---: | ---: |
| Presidência Fenasoja 2024 | 501,13 ms | 635,94 ms |
| Preço da soja hoje | 429,56 ms | 622,87 ms |
| Reserva Legal no RS | 490,94 ms | 601,78 ms |

A carga inicial nessa execução levou 34.076 ms. O plano do predicado trigram escolheu varredura sequencial sob RLS, apesar do índice GIN disponível. Não foi declarado uso de índice que o plano não mostrou, nem um resultado de “80 ms”. A pontuação continua sendo similaridade trigram; FTS não muda os limiares.

## Comandos efetivamente executados

Executados a partir do checkout de trabalho; os caminhos do runtime abaixo identificam o ambiente desta validação.

```powershell
node scripts/kb/build-kb-seed.mjs --stamp 20261017080000 --version 2026-10-17
node scripts/kb/build-kb-seed.mjs --check
node scripts/kb/test-kb-generator.mjs
node scripts/kb/db-qa.mjs --pglite C:/Users/Leonardo/AppData/Local/Temp/fenasoja-bot-qa-dependencies/node_modules/@electric-sql/pglite/dist
node --experimental-transform-types scripts/kb/integration-qa.ts --pglite-module C:/Users/Leonardo/AppData/Local/Temp/fenasoja-bot-qa-dependencies/node_modules/@electric-sql/pglite/dist/index.js
npx vitest run src/test/workersKnowledgeBase.test.ts
npx eslint supabase/functions/_shared/workers/knowledge-base.ts src/test/workersKnowledgeBase.test.ts scripts/kb/integration-qa.ts
git diff --check
npm run build
npm run lint
npm run test
```

O check Deno 2.9.6 configurado para `supabase/functions/workers-orchestrator/index.ts` passou; a saída está em `evidence/deno-check.log`. O comando de referência é `deno check --config supabase/functions/workers-orchestrator/deno.json supabase/functions/workers-orchestrator/index.ts`. O build final passou em **1m01s**, após os ajustes de compatibilidade/acessibilidade/movimento, com aviso de chunks maiores que 500 kB e base Browserslist desatualizada. O lint global falhou com **1.039 erros e 83 avisos**; o lint final do escopo passou com zero erros e sete avisos de Fast Refresh. O resultado global não foi ocultado nem usado para enfraquecer as verificações da entrega.

O `npm run test` global terminou em **17m52s**: **53 suítes falharam e 383 passaram; 95 testes falharam e 3.680 passaram**. Essa execução coincidiu com alterações concorrentes em testes/componentes da interface KB: três falhas pertenciam a `knowledgeSource.test.tsx`. O fechamento registra separadamente a nova execução focada do código congelado; a suíte global permanece reprovada.

As **52 suítes externas à Equipe Fenasoja** foram extraídas automaticamente desse log e repetidas no commit original `6481952ecac1be48777e410a558363fabeac36a9`, em checkout isolado limpo. Usaram Node 24.15.0, Vitest 3.2.4, `maxWorkers=2` e a mesma junction de dependências. Os hashes de `package.json`, configuração Vitest, setup e dos 52 arquivos de teste são idênticos aos do checkout da entrega. **Todas as 52 suítes também falharam no original; 91 dos 92 testes externos falhos voltaram a falhar nos mesmos casos, sem novos casos.** O único caso não reproduzido foi `alvoradaPortalIntegration.test.tsx` → “mostra o estado de carregamento do ecossistema dentro do diálogo”: houve timeout de 5.000 ms na execução global, mas o caso passou no replay. Portanto há 91 falhas preexistentes comprovadas e um timeout não reproduzido; não se atribuem automaticamente as 92 ao estado anterior.

O replay levou **137,68 s** e executou **53 suítes: 52 falharam e uma passou; 91 testes falharam e 374 passaram**. O filtro de nomes do Vitest usa correspondência por substring: `commercialMapPresentation.test.ts` incluiu também o irmão `.test.tsx`, cujos três testes passaram. Esse arquivo adicional está explicitamente excluído da comparação das 52 suítes alvo. A [comparação completa](evidence/baseline-comparison.json), o [log do replay](evidence/baseline-failures.log), a [seleção automática](evidence/baseline-test-files.json), o [ambiente e comando integral](evidence/baseline-environment.json) e o [resultado estruturado do Vitest](evidence/baseline-vitest-results.json) preservam as evidências e a diferença de escopo em relação à execução global.

O checkout de QA `C:/Users/Leonardo/AppData/Local/Temp/fenasoja-kb-baseline-6481952e-qa` permanece temporariamente disponível até a estabilização da PR/CI. Não é um artefato da entrega; nenhum arquivo versionado foi alterado nele, nas migrations antigas ou nos módulos protegidos por essa reprodução.

O histórico das migrations foi conferido antes das alterações. As migrations antigas não foram editadas; a finalização foi ampliada a partir da versão vigente. O CSV recebido sem `(1)`, a divergência de datas/numeração e as referências ausentes no ZIP foram resolvidos por adaptação documentada, sem pressupor artefatos inexistentes.

## Interface e publicação

A apresentação final usa **ícones compactos de fonte**, conforme a orientação posterior do usuário, com identificação da base, rótulo e acesso declarado no detalhe por hover/foco e na descrição acessível. As capturas locais disponíveis incluem [abertura móvel](evidence/mobile-light-welcome.jpg), [fontes móveis](evidence/mobile-light-sources.jpg), [detalhe da fonte](evidence/mobile-source-tooltip.jpg) e [foco dos atalhos](evidence/mobile-sidebar-focus.jpg). Elas são evidência da prévia local, não de publicação ou sessão real. O fechamento global abaixo consolida as dimensões, temas e checagens de interação efetivamente concluídas.

Migrations e código estão preparados para publicação pelo processo estabelecido do ambiente. A conexão administrativa e a sessão remota necessária para confirmar o executor/aplicar migrations não estavam disponíveis. O deploy de frontend não aplica o banco automaticamente. Nenhum deploy remoto foi alegado ou executado nesta validação; o procedimento e a recuperação estão em [banco.md](banco.md) e [atualizacao.md](atualizacao.md).

## Fechamento global da entrega

O código congelado passou em **31 suítes / 507 testes focados**, em 51,12 s, cobrindo os módulos da Equipe, contratos, transporte, motor, KB, fontes, movimento e prévia. [Saída completa](evidence/focused-tests-final.log). Os testes existentes foram preservados; o resultado global reprovado e a comparação com a base continuam descritos acima.

`npm run typecheck`, `npm run build`, Deno, lint focado, `build-kb-seed.mjs --check` e `git diff --check` passaram. A busca de identificadores/textos sentinela no bundle não encontrou os JSON completos nem fixtures da prévia; isso complementa a separação física dos dados do frontend. [Typecheck](evidence/typecheck.log), [lint focado](evidence/scoped-lint.log), [geração](evidence/generator-check-final.log), [bundle](evidence/bundle-check.log) e [diff](evidence/diff-check.log). As migrations antigas e os caminhos protegidos de Mapa Comercial, FCM, Google Sync e Agenda Meeting não foram alterados. O gerador MCP preexistente do build escreveu um import absoluto Windows; esse efeito local foi restaurado ao conteúdo original e não integra o diff.

A conferência Product Design concluiu os temas claro/escuro em 390 × 844 e 1440 × 960 CSS px, navegação por teclado, rótulo longo, cinco atalhos horizontais, fontes compactas, seleção de pergunta sem envio automático e reabertura. O bot específico apareceu acima da resposta; três pontos durante o processamento foram substituídos pela resposta, conservando o mascote. Movimento, piscada, pausa e respeito a movimento reduzido foram observados no navegador, com simulação explicitamente limitada à prévia para o caminho animado. [Relatório visual](design-qa.md), [processamento](evidence/mobile-bot-processing-motion.jpg), [resposta](evidence/mobile-bot-complete-motion.jpg) e [reabertura](evidence/mobile-bot-reopened.jpg). Não houve validação em iPhone físico, VoiceOver ou sessão remota.

A entrega está na [PR #209](https://github.com/leomateus620-pixel/expo-logistics-hub/pull/209). O artefato nativo e os dois jobs aprovados acima identificam explicitamente o commit observado; não são uma afirmação antecipada sobre um futuro head. A etapa externa restante é a publicação no ambiente do projeto com seu acesso administrativo e processo de deploy, seguida das verificações reais descritas em [banco.md](banco.md) e [atualizacao.md](atualizacao.md). Nenhuma migration ou função remota foi publicada nesta sessão.
