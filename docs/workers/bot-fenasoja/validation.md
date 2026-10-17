# Validação — BOT FENASOJA

Data: 17/10/2026, America/Sao_Paulo. Escopo: implementação local na branch `codex/bot-fenasoja`; sem aplicação de migrations ou alteração de dados em produção.

## Resultados

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Testes de workers, registry, respostas, catálogo, propostas e rotinas | 308 testes aprovados, zero falhas | scoped-tests.json |
| UI e hook após último ajuste de contexto | 39 testes aprovados (subconjunto, não somar ao total) | workerUi 23 + workersChat 16 |
| Verificação de tipos | `npm run typecheck` aprovado | execução com saída zero antes do build |
| Build de produção | `npm run build` aprovado | build.log; avisos de chunks e Browserslist registrados |
| Registro Edge gerado | sincronizado com as fontes | build-edge-registry.mjs --check |
| Catálogo interno e documentação gerada | 50 perguntas Mapa + 100 Agenda, IDs únicos | export-question-bank.mjs --check; question-bank.md |
| PostgreSQL: vendas, Agenda, ranking e histórico | 12 verificações aprovadas | analytics-validation.json |
| PostgreSQL: inventário, Agenda filtrada e atualização | 14 verificações aprovadas | question-analytics-validation.json |
| PostgreSQL: persistência e contrato visual | 8 verificações aprovadas | evidence/response-persistence-qa.json |
| Revisão visual Product Design | aprovada nos estados locais documentados | ../../../design-qa.md |

A execução global de `npm test` realizada durante o trabalho terminou com **52 arquivos falhando, 373 aprovados; 91 testes falhando, 3466 aprovados**. Há falhas em suítes de Agenda, Comissão, Mapa e apresentação de módulos fora das alterações deste trabalho. Não foi executada uma comparação integral em checkout limpo do commit de origem; portanto, este relatório não atribui todas essas falhas à baseline nem declara a suíte global aprovada. O conjunto pertinente ao BOT FENASOJA passou separadamente.

O plugin MCP do build local em Windows reescreve seu arquivo gerado com import absoluto da máquina. Esse efeito externo ao escopo foi revertido em `supabase/functions/mcp/index.ts` após o build; o arquivo não integra a PR. O `package-lock.json` já alterado e `.worktrees/` foram preservados e excluídos da entrega.

## Perguntas e dados de teste identificados

O harness local usa os componentes, hook, interpretador, compositor e validação de produção, com identidade/transporte e registros sintéticos. Não é uma validação do provedor remoto.

| Pergunta | Resposta comprovada na fixture |
| --- | --- |
| Como estão as vendas do mapa comercial? | Fenasoja 2028; R$ 1.234.567,00 realizados; R$ 345.678,00 em andamento. Sem tabela de projetos. |
| Quantos eventos eu fiz neste mês? | 15 eventos distintos vinculados; média prevista 2h30 em 12 com horários válidos; vínculo não comprova presença. |
| Mostre um gráfico de barras das pessoas com mais eventos neste mês. | 120, 115, 115, 94, 87; população de 125 pessoas; nomes completos e alternativa tabular. |
| Faça um gráfico de pizza dos eventos por situação neste mês. | 240 eventos: 150 planejados e 90 concluídos; partição completa e valores acessíveis. |
| Compare os eventos deste mês com o anterior. | Outubro 240 versus setembro 180; mesmos filtros, dois agregados completos. |
| Qual é o presidente atual da Fenasoja? | Fixture do perfil Fabiano Soltis, Fenasoja 2028, publicação oficial de 08/09/2026; sem foto de identidade duvidosa nem biografia deduzida. |

As verificações SQL usam outras fixtures explicitamente separadas: vendas com mais de 100 itens, pedido contendo vários lotes, cancelamentos, históricos, ausência de valor e edição diferente; Agenda com vínculos repetidos e subeventos, horários ausentes, eventos que atravessam meses, homônimos, empates e usuários com acessos distintos; inventário de 200 lotes com 20 detalhes exibidos e agrupamentos com Outros. Atualizar um lote/inserir um evento no banco descartável muda a próxima consulta autenticada, sem reconstruir o catálogo. O request_id já concluído continua idempotente.

## Capturas e interação real no navegador

Navegador integrado, viewport efetiva mobile **384×842**, desktop **1263×877**. Ajustes do painel foram 438×960 e 1440×1000; os valores efetivos foram lidos do DOM. Não houve overflow horizontal do documento nos estados observados.

- [Abertura mobile](captures/mobile-intro.jpg), [vendas mobile](captures/mobile-sales.jpg), [vendas desktop](captures/desktop-sales.jpg).
- [Ranking mobile](captures/mobile-agenda-ranking.jpg), [ranking desktop](captures/desktop-agenda-ranking.jpg).
- [Pizza mobile](captures/mobile-agenda-pie.jpg), [pizza desktop](captures/desktop-agenda-pie.jpg), [comparação mobile](captures/mobile-agenda-comparison.jpg).
- [Copiloto mobile](captures/mobile-compact-pie.jpg), [copiloto desktop](captures/desktop-compact-pie.jpg).
- [Comparação antes/depois: vendas](captures/comparison-sales.png), [abertura](captures/comparison-intro.png), [compositor](captures/comparison-composer.png).

Pergunta e resposta foram observadas nessa ordem durante consulta, conclusão e reabertura. Ao reabrir uma conversa do Mapa pela rota da Agenda, a identificação do campo e o próximo envio agora seguem o especialista da conversa; nova conversa volta à seleção da rota. A regressão também é testada no hook. A pausa manual foi verificada com animação efetivamente desativada no DOM.

## Configuração e homologação pendentes

1. Aplicar as quatro migrations incrementais na ordem, depois das migrations existentes dos workers e de `drizzle/migrations/0009_migration.sql`; manter rollback e backup conforme README.
2. Publicar `workers-orchestrator` e módulos compartilhados/registro gerado da mesma versão, com as configurações de provedor e pesquisa já exigidas pelo projeto.
3. Homologar com sessões reais de perfis diferentes e organizações distintas: elegibilidade, reconfirmação, capabilities e RLS remota; conferir contagens contra os módulos oficiais.
4. Confirmar a qualidade do planejamento de perguntas novas no provedor configurado. O catálogo orienta intenções e variações, não transforma todos os exemplos em promessas de dados existentes; ausência e ambiguidade permanecem explícitas.
5. Testar teclado virtual, área segura e preferência de movimento em dispositivo físico. A exceção de movimento é restrita ao mascote principal, por pedido explícito posterior do usuário; há pausa manual e pausa por visibilidade.

Não foram liberados ranking com filtros adicionais não suportados, presença efetiva ou horas trabalhadas por inferência, recebimentos a partir de vendas ou posições históricas de disponibilidade sem fonte. Nessas situações o bot informa o limite e oferece uma consulta compatível. A nova implementação local é revisável e verificável; publicação e homologação remota permanecem separadas.
