# Soja Store · Primeira entrega operacional

## Reconhecimento

O briefing citava `db0ac9fd3388cbb74d28fe01a57cac7acf606e89`. A revisão começou no `main` remoto `31b3b41f929299c5008d3ed188332c3f002252e0`, também informado pelo projeto **Fenasoja Log** no Lovable. O conector reportou Supabase e consultou PostgreSQL 17.6. Antes da implantação, o banco tinha uma comissão ativa com slug `soja-store`, as chaves institucionais exigidas e nenhuma relação ou RPC específica da loja.

| Funcionalidade | Rota ou componente existente | Persistência e autorização | Comportamento preservado ou extensão |
|---|---|---|---|
| Visão geral | `/comissoes/soja-store/dashboard`, `CommissionWorkspacePage` | Identidade e métricas de Agenda, Documentos e Equipe sob os guards existentes | Resumo da loja aparece quando há capacidade para um indicador. A comissão mantém sua visão institucional. |
| Agenda | `agenda`, `useUnitAgenda` | `cronograma_unit_agenda`, métricas e registros da Agenda. Gravação pela interface institucional e suas RPCs. | Linha do tempo, eventos, participantes e documentos mantêm o mesmo fluxo. |
| Documentos | `documentos`, `useUnitDocuments` | Anexos da unidade e dos eventos, RLS e URLs temporárias do bucket institucional | A listagem e os anexos continuam associados à comissão ou ao evento original. |
| Equipe | `equipe`, `CommissionVolunteerTeamPage`, `VolunteerTeamById` | `commissions`, `commission_people`, `commission_responsibles`, avatares privados e RPCs `team_*` | Mantém rota, pessoas, papéis e acesso institucional. A navegação da loja aparece somente quando autorizada. |
| Tarefas | `tarefas`, workspace da comissão | Rota protegida pelo acesso institucional | Mantém a indicação de plano em preparação. |
| Operação da loja | Rotas adicionais abaixo | Tabelas privadas e RPCs `soja_store_*`, com permissão por organização, comissão, pessoa e conta | Catálogo, compras próprias, entradas de estoque, diretórios e revisão de fontes. |

No navegador autenticado da aplicação publicada foram observados a Visão geral em 1440 e 390 px, a linha do tempo, Documentos, a indicação de preparação em Tarefas e os vínculos existentes em Equipe. Os dados e o fluxo administrativo continuam associados às mesmas entidades.

## Rotas liberáveis por capacidade

Todos os caminhos abaixo são relativos a `/comissoes/soja-store`. O menu agrupa Operação, Gestão e Comissão. No celular, os atalhos se ajustam às áreas efetivamente disponíveis.

| Rota | Fluxo disponível nesta entrega |
|---|---|
| `dashboard` | Produtos ativos, pedidos a receber, pedidos recebidos em parte e posições de estoque físico, com consulta ao servidor e acesso ao mesmo recorte da contagem. |
| `produtos`, `produtos/novo`, `produtos/:id` | Pesquisa paginada, produto, SKU padrão ou variantes explícitas, origem textual, ano de coleção, arquivamento e links para saldo e pedidos. |
| `configuracoes` | Cadastro e arquivamento de locais físicos, incluindo pontos de atendimento e locais temporários. |
| `fornecedores` | Cadastro, consulta e arquivamento de fornecedores e seus contatos, prazos e condições. |
| `compras`, `compras/novo`, `compras/:id` | Registro de pedido próprio, snapshots, confirmação física parcial ou total e conferência das quantidades e dos recebimentos. |
| `estoque` | Saldos físicos e trilha das entradas por compra, filtrados por local e variante, com vínculo ao pedido de origem. |
| `importacoes` | Conferência de CSV com origem, original preservado, SHA-256, divergências, correções e revisão versionada. A revisão se encerra em preparação. |

Consulte [modelo e contratos](banco.md), [conferência de fontes](fontes.md) e [revisão de importações](importacao.md).

## Banco conectado ao Lovable

As cinco migrações foram aplicadas e registradas via `query_database` no projeto Fenasoja Log. Os checksums foram recalculados a partir do SQL armazenado no histórico de migrações.

| Versão | SHA-256 confirmado |
|---|---|
| `20261112120000` | `fc336ac96114f33f4410e2ab68493cde858635d235652b34d2c675426e4d70ff` |
| `20261112120100` | `eb51fb33827bdc9d8ecac4ffdb230bc52eb36063c33909624a3d7422cd77a763` |
| `20261112120200` | `f8818c916420839613a8e9ac02e62a4167de9dbe854f05d6ed98a3aecebdeaf7` |
| `20261112120300` | `41a8219d9690b451257b7c9f815c3454bd8c424e420d31766276754f821f9185` |
| `20261112120400` | `f2290292b01a5c22c40c3ad3c02315fab3e0673c3fe941b0457616238d4b7e35` |

A verificação encontrou 16 tabelas privadas com RLS e sem leitura ou escrita direta pela API, 23 RPCs com execução restrita a sessões autenticadas, 48 índices válidos e 138 constraints validadas. A liberação segue desativada. O banco da loja tinha zero concessões, zero lotes de importação e zero movimentos após a implantação. Nenhuma política do Financeiro Fenasoja foi alterada.

## Verificação

- `npm run typecheck` e `npm run build` passaram. O build isolou a Soja Store em seu próprio carregamento sob demanda.
- `npm test` teve 4.317 testes aprovados e 91 falhas. As 91 falhas também ocorreram na árvore anterior, que teve 4.293 aprovações e 94 falhas sob o mesmo Node. Nenhum caso falhou exclusivamente na execução deste PR.
- PostgreSQL descartável validou acessos, revogação, colisão de SKU, consulta paginada, idempotência, conflito de versão, custo segregado, recebimento de 8 em 20, recebimentos concorrentes, trilha de estoque, agregação completa e revisão de CSV com original preservado.
- No navegador, as telas novas foram verificadas em ambiente local isolado, com API simulada. Foram exercitados criação de produto, foco em erro, busca assistida, pedido de 20, excesso de recebimento, recebimento de 8, saldo de 12 pendentes e acesso aos movimentos pelo pedido. O catálogo não apresentou rolagem horizontal em 360, 390, 768, 1024 ou 1440 px. As capturas autenticadas da aplicação publicada serviram de referência para os recursos institucionais existentes. Os dados de teste não foram enviados ao banco conectado.

## Próximas entregas e decisões

- Catálogo ainda precisa de imagens autorizadas, associação produto–fornecedor, preços vigentes, composição de custos e kits. O design usa os tons do catálogo, tipografia de sistema e título editorial. A versão oficial da marca e os direitos das imagens aguardam confirmação.
- Compras cobrem registro de pedido e recebimento. Cotações, alçadas, rateios, adiantamentos, devolução ao fornecedor e obrigações financeiras continuam pendentes.
- O estoque entregue é físico e cobre as entradas de compra própria. Contagem inicial, inventário, ajustes, distribuição institucional, reservas, transferências, saídas, custos de saída e custódia de terceiros precisam de novos comandos e testes.
- Atendimento, pagamentos, caixa, entrega, estornos e recibos dependem de implementação e da decisão formal sobre modalidade, documentos, responsáveis e destinações. Parcerias e repasses precisam de condições vigentes aprovadas.
- Orçamento, liquidações, integração explícita com o Financeiro Fenasoja, cadastro de clientes e apoiadores, encomendas, escalas, treinamento, tarefas persistidas e relatórios exportáveis continuam pendentes.
- A importação histórica depende de validação de recorte e de data-base, incluindo a cobertura dos dois consolidados de 2025. A comissão precisa validar os saldos iniciais, os locais reais e as capacidades das contas antes da liberação.
- Os ensaios com leitor de tela, zoom de texto, redução de movimento e metas de desempenho em ambiente representativo ainda precisam ser executados.
