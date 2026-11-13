# Base de dados da Soja Store

O escopo usa `commissions.id` e `org_id` da comissão existente. A interface resolve a comissão por `useUnitIdentity`. O banco exige comissão ativa do tipo `comissao` e aceita os slugs persistidos `soja-store` e `sojastore`. As chaves estrangeiras compostas preservam o vínculo entre organização, comissão e registro.

## Persistência e acesso

| Entidade | Responsabilidade |
|---|---|
| `soja_store_private.scopes` | Vincula a loja à comissão e controla sua disponibilidade. A instalação não cria escopo habilitado. |
| `soja_store_private.access_grants` | Vincula uma capacidade ao identificador da pessoa, à conta verificada e à comissão. Exige associação ativa na equipe e na organização. |
| `soja_store_private.products` e `variants` | Catálogo contínuo, sem reiniciar por edição. Preserva IDs e variantes arquivadas. Garante SKU único por organização. |
| `soja_store_private.locations` | Locais operacionais por comissão, com tipo, situação e histórico de versões. |
| `soja_store_private.suppliers` | Fornecedores e contatos do escopo. Vencimento, obrigações e liquidações pertencem a fluxos próprios. |
| `soja_store_private.purchases` e `purchase_lines` | Pedido, local de recebimento, fornecedor, quantidades contratadas e valores congelados por variante. |
| `soja_store_private.purchase_receipts` e `purchase_receipt_lines` | Recebimentos físicos, parciais ou completos, com data efetiva, data de registro e referência documental. |
| `soja_store_private.stock_movements` | Razão físico imutável. Cada linha recebida origina uma entrada e cada entrada aponta para essa linha. |
| `soja_store_private.requests` e `audit` | Resultado imutável do comando e registro de autoria e estado antes/depois, gravados na mesma transação. |

As tabelas têm RLS habilitada, sem políticas diretas de leitura ou escrita pelos papéis da API. Somente `authenticated` recebe execução nas RPCs públicas da loja. Cada RPC verifica a capacidade exata no banco. Funções de leitura filtram organização e comissão antes de agregar. Os resultados das mutações incluem identificador, versão e situação persistidos. Nenhum usuário recebe permissão por ser administrador, gestor ou operador geral da Fenasoja.

| Capacidade | Acesso |
|---|---|
| `catalog.view` | Listar e consultar produtos, variantes e origem textual. |
| `catalog.manage` | Criar, editar e arquivar produtos e variantes. Inclui consulta. |
| `settings.view` | Consultar os locais. |
| `settings.manage` | Criar, editar e arquivar locais. Inclui consulta. |
| `suppliers.view` | Consultar o cadastro e os dados de contato de fornecedores. |
| `suppliers.manage` | Criar, editar e arquivar fornecedores. Inclui consulta. |
| `purchases.view` | Consultar pedidos, quantidades e recebimentos. |
| `purchases.costs` | Consultar custos, frete, encargos e totais quando combinada com `purchases.view`. |
| `purchases.receive` | Conferir e registrar recebimento físico quando combinada com `purchases.view`. |
| `purchases.manage` | Registrar pedidos, consultar os valores e registrar recebimentos. Inclui consulta. |
| `stock.view` | Consultar saldo físico, propriedade, local e movimentos. |

A revogação da capacidade, desativação da associação ou troca da conta verificada interrompe o acesso nas próximas consultas. A prova de permissão usa o mesmo usuário registrado na concessão e no vínculo de pessoa. As alterações de acesso e a ativação inicial ficam condicionadas à lista de pessoas e capacidades aprovada pela comissão.

## Contratos do catálogo e dos cadastros

| RPC | Pré-condição | Resultado |
|---|---|---|
| `soja_store_access` | Sessão autenticada. | `enabled` e lista de capacidades efetivas do próprio usuário. |
| `soja_store_catalog` | `catalog.view`, situação válida e página entre 1 e 100 registros. | `items` e total completo do recorte. Pesquisa literal por nome, categoria, SKU, código de barras, nome e atributos da variante. |
| `soja_store_product` | `catalog.view` e produto no escopo. | Produto e suas variantes, inclusive as inativas. |
| `soja_store_save_product` | `catalog.manage`, chave de envio, versão atual em edição e 1 a 100 variantes. | Uma transação grava produto, variantes e auditoria. A variante ativa sem rótulo nem atributos representa o padrão quando é a única ativa. |
| `soja_store_locations` e `soja_store_suppliers` | Capacidade de consulta do cadastro e página entre 1 e 100 registros. | `items` e total do escopo. |
| `soja_store_save_location` e `soja_store_save_supplier` | Capacidade de edição do cadastro, chave de envio e versão atual em edição. | Cadastro criado ou atualizado com auditoria. A situação arquivada preserva ID e histórico. |
| `soja_store_request_status` | Sessão do autor original com a capacidade que autorizou o comando. | Resultado anterior persistido, ou nulo se o envio ainda não consta no banco. |

Um `request_id` distingue a intenção de gravação. Comando, versão e payload são incluídos no SHA-256 canônico. Chave repetida com os mesmos dados devolve o resultado original. Chave repetida com dados diferentes devolve `SOJA_STORE_REQUEST_CONFLICT`. O banco serializa a mesma chave, e a restrição única protege o resultado. Edições de um mesmo registro usam bloqueio da linha e comparam `expected_version`. Versão divergente devolve `SOJA_STORE_STALE_VERSION`. Produto inexistente, SKU ou código de barras duplicado e local duplicado têm erros próprios. Um timeout pode ser reconciliado pelo próprio autor usando a consulta de envio.

## Contratos de compra e estoque

As RPCs recebem `_org_id` e `_commission_id`. Datas civis do pedido e do recebimento são comparadas ao calendário de São Paulo. Instantes de gravação usam `timestamptz`.

| RPC | Entrada adicional e autorização | Efeito ou projeção |
|---|---|---|
| `soja_store_create_purchase` | `_request_id` e `_payload` com fornecedor, local, data do pedido, linhas de variante, quantidade e custo unitário. Previsão, referência, frete e encargos são opcionais. Exige `purchases.manage` e cadastros ativos. | Cria pedido no estado `ordered` com ID, versão e total em centavos. Quantidade física entra pela conferência de recebimento. |
| `soja_store_receive_purchase` | `_request_id`, `_expected_version` e `_payload` com pedido, data efetiva e linhas com quantidade e ID da linha original. Referência opcional. Exige `purchases.view` e `purchases.receive` ou `purchases.manage`. | Bloqueia o pedido, limita a entrada ao saldo pendente e grava recibo físico e movimentos em uma transação. Devolve ID e versão do pedido, ID do recebimento, estado `partially_received` ou `received` e `total_cents` nulo. |
| `soja_store_purchases` e `soja_store_purchase` | `purchases.view`. A lista aceita situação, fornecedor, local, variante e página. O detalhe recebe o ID do pedido. | Lista com total do recorte ou pedido com linhas, quantidades pedidas, recebidas, pendentes e trilha de recebimento. Valores retornam nulos quando a capacidade de custo está ausente. |
| `soja_store_purchase_options` | `purchases.manage`, pesquisa e IDs selecionados opcionais. | Fornecedores, locais e variantes ativas para preenchimento do pedido. A projeção de fornecedor contém ID e nome comercial. |
| `soja_store_stock` e `soja_store_stock_movements` | `stock.view`. Local, variante e página opcionais. | Posições agrupadas por variante, local, proprietário e destinação, ou movimentos com a origem do recebimento. O total usa o recorte completo. Os campos são físicos e cadastrais. |
| `soja_store_stock_options` | `stock.view`, pesquisa e IDs selecionados opcionais. | Locais e variantes presentes nos movimentos, mantendo as seleções dentro do escopo. |
| `soja_store_dashboard` | Ao menos uma entre `catalog.view`, `purchases.view` e `stock.view`. | Contagens de produtos ativos, pedidos encomendados, pedidos parcialmente recebidos e posições de estoque físico. Cada resultado exige a capacidade da seção correspondente e usa a mesma seleção do link que o detalha. O servidor inclui o instante da consulta. |

Quantidade e custo unitário são decimais com até seis casas. O servidor arredonda cada subtotal para o centavo mais próximo, com meio centavo para cima. O total soma subtotais, frete e encargos. O custo-base do movimento preserva o valor unitário do pedido. Rateio de frete e composição do custo de saída dependem da política de apropriação aprovada. Os pedidos registram compra própria e destino loja. O recebimento físico e o registro financeiro terão vínculos próprios.

Pedidos, recebimentos e movimentos preservam os identificadores e snapshots. Um pedido pendente impede arquivar seu local. A unidade de um produto referenciado por compra fica vinculada aos registros. O estoque exibe a identificação cadastral atual para o saldo e o snapshot da compra para o movimento histórico.

## Extensão do estoque

A contagem física registra uma posição de estoque próprio da loja por variante e local. Na primeira conferência sem movimento, ela registra a abertura. Nas seguintes, registra a quantidade conferida e a diferença assinada em relação ao saldo. A confirmação exige motivo, permite referência documental e guarda a data civil de São Paulo, o autor e o snapshot do produto e do local. Uma conferência de zero ou sem diferença permanece explícita no histórico com variação zero. A operação usa `stock.manage`.

`soja_store_inventory_options` consulta locais e variantes ativos, inclusive antes do primeiro movimento. `soja_store_inventory_position` informa o saldo físico, a quantidade disponível e a versão a confirmar. `soja_store_record_inventory` recebe `request_id`, `expected_version` e `variant_id`, `location_id`, `kind`, `quantity`, `reason` e `reference` opcional no payload. O resultado inclui o ID da contagem, o ID do movimento e a nova versão da posição. Em conflito, consulte o saldo atualizado e confira a quantidade novamente.

A migração `20261112120600_soja_store_inventory.sql` deriva as posições dos movimentos nativos já gravados, preservando os IDs e os vínculos das compras. Um gatilho atualiza a projeção na transação de cada movimento. Recebimento de compra e contagem compartilham o bloqueio por local, inclusive para variantes ainda sem saldo. O saldo disponível é físico menos reservado. Correções usam movimentos compensatórios e preservam o evento original.

`20261112120900_soja_store_transfers.sql` registra transferências de uma variante de estoque próprio por solicitação. `soja_store_create_transfer` registra origem, destino, SKU, quantidade e motivo. `soja_store_dispatch_transfer` valida o saldo disponível e registra a saída, com referência opcional. `soja_store_receive_transfer` registra somente a quantidade conferida dentro do saldo em trânsito. A diferença permanece em trânsito até conferência posterior. `soja_store_cancel_transfer` encerra uma solicitação antes da expedição. Os três comandos de transição exigem a versão atual e compartilham a chave de envio auditada. `soja_store_transfers` lista por situação e `soja_store_transfer` abre o histórico de expedição e recebimentos, com referências e datas.

O saldo em trânsito por transferência é a quantidade expedida menos os recebimentos confirmados. Está separado do disponível de cada local. Expedição e recebimento geram movimentos de sinais opostos no mesmo razão. Uma mudança de unidade entre a solicitação e a expedição exige nova solicitação. O histórico de compras continua preservando seus custos de aquisição. A apropriação de custos de saída e transferência depende da política de custo aprovada, e os movimentos de transferência mantêm custo nulo nesse estágio.

`20261112121300_soja_store_institutional_issue.sql` registra a saída física de uma variante de estoque próprio para uma comissão ativa da organização. O comando `soja_store_register_institutional_issue` exige local, produto, quantidade entregue, comissão de destino, nome de quem recebeu, motivo e versão atual da posição. A referência da entrega é opcional. O registro imutável preserva autor e destinatário, e o movimento desconta somente o saldo disponível. O evento é físico e o custo permanece sem apuração até existir política de custo aprovada.

Consignação exige titularidade e condição rastreáveis. A reconciliação deve preservar cada recebimento existente como entrada própria da loja e comparar a projeção aos movimentos por variante, local, proprietário, destinação e condição.

Reservas terão quantidades e expiração em registros separados do razão físico. O comando de saída, o cancelamento e a expiração devem bloquear a mesma posição e a mesma reserva em ordem estável. Uma projeção transacional por posição permite validar a disponibilidade e evitar saldo negativo na última unidade. A reconciliação deve comparar projeção, movimentos e reservas sob o mesmo recorte. Compras e movimentos de custódia precisam preservar a unidade e separar estoque próprio e de terceiros.

## Implantação e verificação

Migrações aditivas versionadas em `supabase/migrations`:

1. `20261112120000_soja_store_catalog.sql`.
2. `20261112120100_soja_store_directory.sql`.
3. `20261112120200_soja_store_purchases_stock.sql`.
4. `20261112120300_soja_store_import_staging.sql`.
5. `20261112120400_soja_store_overview.sql`.

A aplicação no ambiente conectado segue exclusivamente a ação direta `query_database` do Lovable. Registre a fonte exata e o SHA-256 no histórico `supabase_migrations.schema_migrations` dentro da mesma transação. Confirme o projeto, a referência Git e o banco antes da primeira escrita. Verifique as chaves compostas de `commissions`, `commission_people` e `commission_responsibles`, além dos privilégios, da RLS e dos RPCs instalados. Sem concessões, as consultas de dados devem devolver acesso negado. A implantação pode ser suspensa desabilitando o escopo. As linhas e os vínculos já registrados permanecem disponíveis para auditoria autorizada.

Para suspender a operação, localize o escopo pela organização e comissão verificadas, desative-o e confirme a recusa de novas consultas e comandos. Aguarde o término dos comandos iniciados anteriormente. Confira as últimas gravações pelo registro de auditoria e reconcilie as quantidades pedidas, recebidas e movimentadas. Em seguida, a versão anterior da interface pode voltar a usar as rotas institucionais. A retomada conserva o mesmo escopo e os mesmos IDs. Se houver correção de dados consolidados, faça-a por um movimento compensatório versionado com referência à origem.

O teste em PostgreSQL descartável usa um fixture mínimo das tabelas institucionais. Ele valida isolamento, revogação, idempotência, SKU concorrente, paginação e conflito de edição. Para compras e estoque, cobre a entrada de 8 em um pedido de 20, concorrência no saldo de 12, arredondamento de meio centavo, rejeição de recebimento excedente, proteção de históricos, preservação de snapshot e acesso de recebimento com custos ocultos. Rode `node scripts/soja-store/database-qa.mjs` apontando `SOJA_STORE_TEST_PG_SOCKET` para o diretório de socket de um PostgreSQL local descartável e `SOJA_STORE_TEST_PG_PORT` para a sua porta, se diferente de 55442. O teste cria e descarta um banco de fixture dentro desse servidor. As permissões de produção e os fluxos via navegador são verificações próprias.
