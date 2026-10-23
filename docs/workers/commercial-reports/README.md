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

Períodos têm base explícita de criação ou assinatura e usam `America/Sao_Paulo`. Comparações exigem a mesma base. “Como estava em uma data passada” exige reconstrução histórica que esta versão não implementa; o bot informa a limitação. Edição só é indicada quando comprovada por campo próprio do projeto: ano do preço, nome de PDF, data da venda e referência do mapa não permitem inferir 2028. Homônimos ou referências ambíguas pedem identificação adicional. Geometria, área ou vínculos ausentes aparecem na cobertura. Escala métrica só é afirmada com calibração válida; norte não é inventado.

## Migrações e implantação

Migrações aditivas aplicadas pelo plugin Lovable e registradas após COMMIT: `20261023140000` (consulta), `150000` (fotografias/jobs/bucket/consumidor), `160000` (resposta v2), `170000` (paridade e comparação), `180000` (persistência de respostas por foco) e `190000` (seletores, revisão e abrangência do pedido). Hashes e verificações do banco conectado estão em [validation.json](validation.json). As transações de DDL conferiram fingerprints comerciais sem alterações. A validação de jobs no banco ativo foi revertida; não manteve conversas/fotografias/jobs de teste.

A evidência de DDL e os testes com papel/claims do usuário no banco não substituem implantação das Edge Functions nem uma jornada HTTP autenticada completa no navegador. O estado de implantação e a validação integrada constam separadamente no registro de entrega.

Não reaplicar a base antiga. Para reversão operacional, interromper primeiro o consumidor e a entrada de novos jobs e publicar uma compensação versionada da projeção/renderer. Preservar vendas, contratos, fotografias já usadas, arquivos válidos e auditoria até sua expiração. Não apagar tabelas ou bucket como rollback após emissões. Uma correção de semântica cria nova fotografia e template quando necessário; não reescreve documentos emitidos.

Os tipos de RPC afetados têm sobreposição aditiva em `src/features/workers/database.ts`. `scripts/workers/build-report-rpc-types.mjs` gera apenas o catálogo revisado de relatórios, sem substituir o schema principal: seis funções autenticadas e cinco internas, estas últimas excluídas do cliente de navegador. Tipagem não concede grants. Executar com `--check` verifica sincronismo com as migrações.

## Validação registrada

- SQL de consulta: **73 verificações** (60 da projeção inicial e 13 adicionais dos seletores/abrangência) em PostgreSQL isolado com PGlite e dados sintéticos; inclui totais completos, assinaturas, homônimos, documentos/versões, centavos e resíduos, filtros, períodos, atualização, autorização e reaplicação sem alterar fatos.
- Jobs: **21 verificações** isoladas de idempotência, lease/retry, retenção e revogação de download.
- Contrato v2: **13 verificações** isoladas de sanitização e persistência dos blocos.
- Testes focados da fronteira comercial/registro: **83 aprovados** na execução registrada; números finais devem ser atualizados após os últimos ajustes.
- Baseline `9f01dcd1`: **457 arquivos, 3.942 testes; 90 falhas e 3.852 aprovações**. A execução inicial da branch tinha as mesmas 90 falhas e somente três adicionais: registro gerado desatualizado e duas expectativas antigas de intenção. O registro foi regenerado; as duas expectativas foram ajustadas mantendo a intenção de recebimentos separada. A comparação foi por identidade exata de cada teste, sem atribuir as falhas preexistentes à entrega.

Scripts reproduzíveis: `validate-commercial-report-query.mjs`, `validate-commercial-report-artifacts.mjs`, `validate-commercial-response-v2.mjs`, `build-edge-registry.mjs --check` e `build-report-renderer.mjs --check`. PGlite é instalado fora do repositório; fixtures não são executadas no banco ativo. PDFs e capturas anexados à entrega devem identificar dados sintéticos. Uma captura emulada não comprova teste físico em iOS. A validação final de typecheck, build, suite, PDFs renderizados e acesso autenticado deve registrar o resultado realmente observado.


Validação final antes da implantação: typecheck e build aprovados; **631 testes pertinentes** aprovados. Suite completa: **4.022 testes, 3.932 aprovados e as mesmas 90 falhas preexistentes**, sem novas falhas. Há 73 verificações SQL de consulta, 21 de jobs, 16 de persistência e 35 do fluxo PostgreSQL → chat. O renderer vetorial foi executado em Deno com carga sintética de 706 linhas e 1.652 lotes: 89 páginas em 388 ms no ambiente local (não é benchmark do servidor hospedado). Exemplos renderizados em [examples](examples/) e evidências visuais em [commercial-reports-qa](../commercial-reports-qa/README.md).
