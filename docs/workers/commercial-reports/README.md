# BOT FENASOJA — consultas comerciais e relatórios

A funcionalidade usa o chat, histórico, autorização, ferramentas e contrato de resposta existentes. Uma pergunta comercial resolve filtros tipados, consulta uma projeção determinística do banco, captura uma fotografia imutável e apresenta uma prévia limitada. O pedido textual de PDF ou a ação do cartão prepara um job de artefato; não exige confirmação de reserva/venda e não altera negócios.

## Arquitetura

| Camada | Responsabilidade |
| --- | --- |
| `src/lib/workers/commercial-report.ts` e cópia Edge idêntica | Especificação estrita, DTO autorizado, catálogo de métricas e validação de identidade/generation. |
| `workers_map_commercial_report` | Escopo validado no servidor; consulta completa, agregados distintos, centavos, contratos explícitos, geometria e comparação temporal na mesma visão MVCC. |
| Registro de ferramentas / orquestrador | Consulta somente leitura. Guarda a evidência completa fora do contexto do modelo e persiste a fotografia por operação separada e auditável. Prévia de até 25 linhas; exportação usa o conjunto completo. |
| `workers_private.commercial_report_snapshots` | Evidência de emissão por organização, usuário, projeto, conversa e solicitação; não é um cadastro mestre comercial. |
| `workers_private.commercial_report_jobs` | Idempotência por fotografia/template, claim exclusivo, lease de dois minutos, até três tentativas e estados reais. Consumidor persistente por `pg_cron`/`pg_net`. |
| `workers-commercial-reports` | Prepara, consulta estado, entrega planta e medeia download. Worker renderiza somente a fotografia capturada. |
| `report-pdf.ts` / `report-plan.ts` | jsPDF/autoTable e projeção pura compartilhada com a Dashboard, empacotada para Edge. A4 gerencial e A3 para plantas vetoriais. |
| `WorkerCommercialReport` / `WorkerCommercialPlan` | Cartão persistido, consulta atual de estado, tabela limitada, planta, atualização e download acessíveis. Mensagens v1 continuam legíveis. |

`generated/read-tools.js` e `generated/report-pdf.js` são produzidos pelos scripts de build; não são editados manualmente. O backend não importa `src` em execução. A fronteira MCP devolve somente os campos públicos da ferramenta e nunca a fotografia completa interna.

## Métricas e identidade

- **Pedidos:** identidades distintas de pedido ou registro legado; um pedido parcial não se duplica no total. Subconjuntos assinados e em aberto podem compartilhar o mesmo pedido.
- **Assinatura confirmada:** item `SIGNED`, com data de assinatura e venda `CONFIRMED` coerente. O cabeçalho do pedido e a existência de documento não comprovam assinatura de todos os itens.
- **Em aberto:** `PENDING_SIGNATURE` com venda `OPEN`; não representa recebimento. `CANCELLED` preserva histórico.
- **Legado:** `LEGACY_UNVERIFIED` ou venda anterior sem item verificável; pode continuar `SOLD` no mapa, mas fica discriminado e fora do principal confirmado.
- **Principal:** valores negociados dos snapshots elegíveis, calculados em centavos. O principal total pode abranger itens assinados e pendentes, discriminados nos respectivos indicadores. Não substitui preço histórico por tabela vigente.
- **Taxas:** componente separado. Concilia principal ativo, total do pedido e componentes de taxa; rateia sobre todos os itens ativos antes dos filtros. Piso proporcional em centavos e resíduos por UUID estável fecham o pedido. Itens cancelados recebem zero; pedidos não conciliados produzem cobertura incompleta, não taxas inventadas.
- **Recebimentos:** não são calculados a partir de assinatura, contrato ou parcela apenas prevista. Este relatório não amplia acesso ao Financeiro.
- **Área negociada:** `official_area_snapshot`; área atual vem do lote vigente. Ausência permanece desconhecida. Renumeração e arquivamento não reescrevem os snapshots anteriores nem transferem venda para descendentes.
- **Expositores:** identidade canônica `exhibitor_id`; homônimos com IDs diferentes não são fundidos. Nome atual e identificação histórica são distintos. Contagens por área não são aditivas.
- **Documentos:** identidade lógica, vínculo explícito e versão ativa; dez lotes ligados ao mesmo documento contam um documento. Versões e documentos inativos ficam discriminados. `ORDER_ITEMS` usa os lotes de `lot_contract_lots`; proximidade de nome não cria vínculo. Sem permissão é informação restrita, nunca zero.

Pavilhões são resolvidos por pais persistidos e pelo registro físico: Pavilhão 12 é B3; Pavilhão 13 é B5; Pavilhão 7 é B10. Segmentos usam o cadastro canônico. Filtros de dimensões diferentes se intersectam; vários pavilhões na mesma dimensão se unem. IDs técnicos não são números comerciais. Ausência de referência persistida gera “Pedido sem referência comercial”, sem fabricar código a partir de UUID.

## Autorização e retenção

Todas as entradas revalidam sessão, acesso aos bots por `ai_workers_can_access`, organização e projeto. O fluxo comercial de relatórios exige a capability explícita `map.manage_sales`; o acesso geral ao mapa não concede histórico de pedidos. Referências e presença de contratos exigem também `map.manage_contracts`. Nomes usam a projeção específica com allowlist; a proteção global de `buyer_name` não foi removida. CPF/CNPJ, contatos, PDFs contratuais, caminhos de arquivo e URLs privadas não entram no modelo ou nas prévias.

O bucket `workers-commercial-reports` é privado. O chat conserva a identidade do relatório; o download é mediado e revalida acesso a cada nova solicitação. Não se persiste URL assinada no chat. O worker interno é restrito a service role e o consumidor agendado usa segredo em Vault.

Fotografia e arquivo têm validade de 30 dias, exibida no produto. Atualizar cria outra fotografia/emissão; não muda o PDF anterior. Cada lease escreve em caminho próprio, impedindo que um renderer antigo sobrescreva o resultado de outro. Caminhos de todas as tentativas ficam registrados para limpeza. A manutenção remove objetos expirados pela API de Storage e depois elimina os dados das fotografias, inclusive consultas nunca exportadas e jobs sem arquivo. Metadados e auditoria mínima não duplicam nomes ou valores.

## Consultas e limitações

Exemplos: “Como estão as vendas da ExpoRural?”, “Mostre só as que aguardam assinatura”, “Inclua empresas e lotes”, “Agora gere em PDF com a planta”, “Compare ExpoRural e Espaço do Automóvel”, “Quais empresas estão no Pavilhão 13?”, “Documentos com versões anteriores”, “Principal e taxas separados” e “Compare vendas cadastradas em setembro e outubro”. Cada nova consulta operacional lê a fonte real; a continuidade guarda filtros, não saldos eternos.

Inventário representa a situação vigente: períodos herdados de vendas são retirados ao trocar o foco; pedidos explícitos de ocupação passada recebem esclarecimento, e RPCs recusam a combinação inválida. Escopos resolvidos são deduplicados por tipo e UUID antes da consulta. Períodos de vendas têm base explícita de criação ou assinatura e usam `America/Sao_Paulo`. Comparações exigem a mesma base. “Como estava em uma data passada” exige reconstrução histórica que esta versão não implementa; o bot informa a limitação. Edição só é indicada quando comprovada por campo próprio do projeto: ano do preço, nome de PDF, data da venda e referência do mapa não permitem inferir 2028. Homônimos ou referências ambíguas pedem identificação adicional. Geometria, área ou vínculos ausentes aparecem na cobertura. Escala métrica só é afirmada com calibração válida; norte não é inventado.

## Migrações e implantação

Migrações aditivas aplicadas pelo plugin Lovable e registradas após COMMIT: `20261023140000` (consulta), `150000` (fotografias/jobs/bucket/consumidor), `160000` (resposta v2), `170000` (paridade e comparação), `180000` (persistência de respostas por foco) e `190000` (seletores, revisão e abrangência do pedido) e `200000` (compensação para inventário atual e deduplicação de escopos). Hashes e verificações do banco conectado estão em [validation.json](validation.json). As transações de DDL conferiram fingerprints comerciais sem alterações. A validação transacional de jobs no banco ativo foi revertida. Posteriormente, a jornada HTTP autenticada gerou uma emissão privada real para validar a implantação, conforme o registro abaixo; ela segue a retenção de 30 dias.

As funções `workers-orchestrator` e `workers-commercial-reports` foram implantadas com sucesso pelo `deploy_edge_functions` do Lovable, por último na revisão `0e2233b24ccc0d21617ba902e2ed31f16a303bc3`. Ambas passaram em `deno check` no sandbox Deno 2.6.10; a ferramenta de implantação não executa typecheck no runtime hospedado. O fluxo autenticado do Pavilhão 13 gerou e entregou PDF privado de 12 páginas. Os hashes submetidos e a evidência técnica estão em `validation.json`.

**Limite de implantação:** após as sete migrações e essa implantação, o proprietário pediu que nenhuma outra chamada fosse enviada ao Lovable para preservar créditos. A PR inclui correções posteriores de continuidade do inventário, mensagem de erro e cabeçalho órfão no PDF que ainda precisam de implantação das funções. A migração compensatória `200000` já foi aplicada e verificada; o servidor recusa o filtro temporal inválido mesmo antes da atualização da mensagem amigável. O frontend permanece proposto na PR. Nenhum novo pedido foi enviado ao Lovable após a orientação do proprietário.

Não reaplicar a base antiga. Para reversão operacional, interromper primeiro o consumidor e a entrada de novos jobs e publicar uma compensação versionada da projeção/renderer. Preservar vendas, contratos, fotografias já usadas, arquivos válidos e auditoria até sua expiração. Não apagar tabelas ou bucket como rollback após emissões. Uma correção de semântica cria nova fotografia e template quando necessário; não reescreve documentos emitidos.

Os tipos de RPC afetados têm sobreposição aditiva em `src/features/workers/database.ts`. `scripts/workers/build-report-rpc-types.mjs` gera apenas o catálogo revisado de relatórios, sem substituir o schema principal: seis funções autenticadas e cinco internas, estas últimas excluídas do cliente de navegador. Tipagem não concede grants. Executar com `--check` verifica sincronismo com as migrações.

## Validação registrada

- SQL de consulta: **82 verificações** (projeção, seletores/abrangência e compensação de inventário atual) em PostgreSQL isolado com PGlite e dados sintéticos; inclui totais completos, assinaturas, homônimos, documentos/versões, centavos e resíduos, filtros, períodos, atualização, autorização e reaplicação sem alterar fatos.
- Jobs: **21 verificações** isoladas de idempotência, lease/retry, retenção e revogação de download.
- Contrato v2: **16 verificações** isoladas de sanitização e persistência dos blocos.
- Testes pertinentes: **636 aprovados em 41 arquivos**, sem falhas. Typecheck e build aprovados.
- Baseline `9f01dcd1`: **457 arquivos, 3.942 testes; 90 falhas e 3.852 aprovações**. A execução inicial da branch tinha as mesmas 90 falhas e somente três adicionais: registro gerado desatualizado e duas expectativas antigas de intenção. O registro foi regenerado; as duas expectativas foram ajustadas mantendo a intenção de recebimentos separada. A comparação foi por identidade exata de cada teste, sem atribuir as falhas preexistentes à entrega.

Scripts reproduzíveis: `validate-commercial-report-query.mjs`, `validate-commercial-report-artifacts.mjs`, `validate-commercial-response-v2.mjs`, `build-edge-registry.mjs --check` e `build-report-renderer.mjs --check`. PGlite é instalado fora do repositório; fixtures não são executadas no banco ativo. PDFs e capturas anexados à entrega devem identificar dados sintéticos. Uma captura emulada não comprova teste físico em iOS. A validação final de typecheck, build, suite, PDFs renderizados e acesso autenticado deve registrar o resultado realmente observado.


Suite completa mais recente: **462 arquivos e 4.027 testes; 3.937 aprovados e as mesmas 90 falhas preexistentes**, sem novas falhas. Há 82 verificações SQL de consulta, 21 de jobs, 16 de persistência e 35 do fluxo PostgreSQL → chat. O renderer vetorial foi executado em Deno com carga sintética de 706 linhas e 1.652 lotes: 89 páginas em 388 ms no ambiente local (não é benchmark do servidor hospedado). Exemplos renderizados em [examples](examples/) e evidências visuais em [commercial-reports-qa](../commercial-reports-qa/README.md).

Na implantação inicial, uma sessão autenticada elegível aos bots obteve resposta v2 do orquestrador com HTTP 200, fotografia persistida e job observado em `requested` → `rendering` → `ready`, concluído na primeira tentativa. O download mediado retornou HTTP 200 e um PDF de **430.442 bytes e 60 páginas**, com SHA-256 `05680f9301214dad2d6de3fb2b050c34eb8b0e1af65cd43e01268f8683a3973f`. A emissão foi criada em **23/10/2026 às 11h25min23s (America/Sao_Paulo)** e vence em **22/11/2026**. Os testes negativos retornaram HTTP 401 para anônimo e HTTP 403 para segredo interno inválido. Nenhum fato comercial foi alterado. Nomes, valores, identidade da sessão e links privados não são publicados como evidência.

As últimas correções da PR aguardam implantação, conforme a restrição acima. A validação visual disponível usa fixture sintética em 703 px e iframe de 390 px; não foi declarado teste físico de iOS nem jornada completa da interface autenticada no navegador.

A revisão intermediária `0e2233b2` passou em ambas as funções no Deno 2.6.10 do sandbox Lovable e produziu relatório autenticado do Pavilhão 13: 104 lotes de inventário, 12 páginas, 306.247 bytes, uma tentativa e duas preparações idempotentes. O SHA-256 do download e do registro no banco coincidiu (`9179eb096341d0343b6702b782dcb2454cdf2e830b1b168d88f1d924df334a9f`). As últimas correções de continuidade e quebra de página aguardam implantação por orientação do proprietário, sem novas chamadas ao Lovable.

A suíte final foi repetida com `--maxWorkers=2 --minWorkers=1` após oscilações de tempo/infraestrutura na execução padrão. Concluiu com as identidades das 90 falhas exatamente iguais ao baseline; nenhuma falha nova. Um teste adicional de história do mapa passou isoladamente (13 testes do arquivo). O código final das duas funções também passou em Deno 2.9.6 local; esta conferência local não significa nova implantação no Lovable.
