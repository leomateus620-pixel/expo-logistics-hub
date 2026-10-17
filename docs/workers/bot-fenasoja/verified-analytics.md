# Consultas verificáveis do BOT FENASOJA

Diagnóstico realizado na branch `codex/bot-fenasoja`, a partir do commit `725f57342b0fdbc1344b5590121af6543afff3f2`.

## Causas confirmadas no caminho de dados

- `readRows` limita registros em 100, embora conserve o total do filtro. `list_events` e `map_inventory` eram listagens, não agregações analíticas. Agrupar as linhas recebidas não representa a distribuição do conjunto inteiro.
- `list_commercial_sale_orders` devolve uma linha por pedido, quantidade de itens e estados técnicos. Somar linhas de pedidos com linhas de lotes mistura unidades diferentes; exibir o objeto cru deixa `kind`, `reference`, `item_count` e os estados de assinatura aparecerem na conversa.
- `map_projects.name` e `reference_revision` descrevem a referência cartográfica. A referência de 2026 pode conter o fluxo comercial de 2028. Usar o título do projeto como edição comercial produz um contexto incorreto.
- A criação de eventos registra `created_by_user_id`; a responsabilidade principal antiga pode estar em `responsible_user_id`; a relação canônica de pessoas está em `cronograma_evento_responsaveis.org_member_user_id`. Os subeventos mantêm sua própria relação em `cronograma_subevento_responsaveis`. Um usuário pode aparecer em todos esses vínculos para o mesmo evento.
- Os papéis textuais da relação são livres. `is_primary` e o responsável persistido indicam responsabilidade; o texto do nome ou do papel não determina identidade. Comissão associada não comprova presença individual. Não há registro de frequência identificado neste caminho da Agenda.

## Definições comerciais

| Indicador | Definição |
| --- | --- |
| Valor confirmado dos espaços | Soma de `item_total` dos itens da edição comprovada pela regra de preço, com estado de assinatura confirmado e venda correspondente confirmada e não revertida. Conversão de reais para centavos ocorre no PostgreSQL, antes da composição. |
| Valor em andamento | Soma dos itens ainda aguardando assinatura com venda em aberto, na mesma edição. |
| Pedidos confirmados / em andamento | Pedidos distintos com pelo menos um item no respectivo estado. Um pedido parcial pode aparecer nas duas contagens; somá-las duplicaria esse pedido. |
| Espaços confirmados / em andamento | Lotes distintos com itens no respectivo estado. Um pedido pode conter vários espaços. |
| Cancelados | Itens cancelados da edição, excluídos dos valores e dos espaços ativos. |
| Histórico não verificado | Itens históricos sem comprovação de assinatura, mantidos no histórico e fora do valor confirmado. A aparência cadastral de vendido não confirma assinatura. |
| Sem edição comprovada | Vendas avulsas antigas e itens sem regra de preço identificável. Permanecem fora dos valores de uma edição; a quantidade informa a limitação sem atribuir esses registros a um ano. |
| Valores ausentes | Quantidade de itens confirmados/em andamento sem valor válido. O subtotal conhecido continua verificável e precisa ser apresentado como valor conhecido. Zero permanece um valor válido. |

Os indicadores são valores **dos espaços**. Não incluem taxas adicionais do pedido, pois não existe uma distribuição persistida de taxas entre itens confirmados e pendentes de um pedido parcial. Também não significam dinheiro recebido. Anexos, parcelas e pagamentos não são usados para presumir assinatura.

O resolvedor usa `commercial_price_rules.exercise` e sua configuração ativa, dando precedência a regras específicas do projeto sobre regras globais. Uma edição explicitamente solicitada também pode ser resolvida por regras históricas vinculadas aos itens. Mais de uma combinação válida requer esclarecimento; nenhuma exige configuração/acesso. O ano não é extraído da rota, do nome do projeto, da geometria ou da data de criação da venda. A agregação filtra novamente cada item pela edição da regra que originou seu preço.

Quando a pergunta pede um período, exige as duas datas inclusivas em São Paulo. Itens atualmente confirmados usam a data de assinatura; itens atualmente em andamento usam a data de criação; cancelados usam a data de cancelamento para sua contagem separada. Itens sem a data aplicável ficam fora do recorte e são contabilizados como data não verificável. Esses indicadores descrevem o estado atual dos itens associados àquelas datas; não reconstroem como o mapa estava em uma data passada. Uma comparação de posições históricas exige snapshots próprios e não deve ser inferida deste recorte.

## Definições da Agenda

- O período é inclusivo em datas locais de `America/Sao_Paulo`. Um evento entra quando suas datas se sobrepõem ao período; eventos que atravessam mês ou meia-noite entram uma vez.
- Eventos cancelados e sem data exata são excluídos. Subeventos não acrescentam eventos ao total: seus vínculos são reunidos no evento principal, e subeventos cancelados não acrescentam vínculo.
- `created` conta criação pela conta autenticada; `responsible` conta responsabilidade principal persistida, inclusive no subevento; `linked` reúne criação, responsabilidade e demais vínculos diretos. Não pesquisa por nome, nem atribui todos os eventos de uma comissão aos seus integrantes.
- A duração é o intervalo **agendado completo** do evento selecionado. Horários ausentes, duração zero e intervalos inválidos não entram na média. Fim anterior ao início no mesmo dia é interpretado como término no dia seguinte, conforme a regra já utilizada pela ponte do Restaurante.
- A resposta informa quantos eventos sustentam a média. Um evento que atravessa o período mantém sua duração completa; não se apresenta esse valor como horas efetivamente trabalhadas dentro do mês.
- `completed_events` representa a situação concluída registrada. `past_events` representa apenas horário passado. Vínculo, conclusão administrativa e horário passado não comprovam presença.
- A distribuição por dia e dia da semana usa o início persistido do evento. Um evento de setembro que termina em outubro entra uma vez na contagem de eventos que se sobrepõem a outubro, mas conserva seu dia de início em setembro para a distribuição. Ele não é transformado em um evento iniciado no primeiro dia do mês.
- O ranking agrupa identidades persistidas e conta eventos principais distintos sobre **todo** o conjunto autorizado. Ordena por quantidade decrescente, nome e identidade para desempate estável. O limite de até 30 pessoas aplica-se depois da agregação. Homônimos conservam o nome completo e recebem um sufixo de vínculo; pessoas externas sem identidade persistida são explicitamente excluídas.

## Contratos e autorização

As ferramentas `map_sales_overview`, `agenda_personal_summary` e `agenda_people_ranking` têm entradas fechadas e saídas validadas em Zod. Uma resposta parcial ou fora do contrato não vira um total. Valores precisam ser finitos e seguros; os totais monetários excedendo `Number.MAX_SAFE_INTEGER` falham no banco. A validação também confere o denominador da duração, a distribuição dos dias e as posições/identidades/rótulos do ranking.

Cada função usa `SECURITY INVOKER`, o JWT do chamador e as RLS existentes. `workers_require_read_scope` exige usuário autenticado, vínculo ativo na organização e `ai_workers_can_access`. A consulta comercial reconfirma `map.manage_sales`. Não há política ampliada, credencial privilegiada, consulta pública com dados internos, escrita comercial ou cache compartilhado.

O registro canônico está em `src/lib/workers`; os artefatos Edge são regenerados com:

```powershell
node scripts/workers/build-edge-registry.mjs
node scripts/workers/build-edge-registry.mjs --check
```

## Implantação e recuperação

`20261017020000_workers_verified_analytics.sql` é incremental e contém apenas funções de leitura. Requer as migrations comerciais/Agenda existentes, as migrations anteriores dos workers e **`drizzle/migrations/0009_migration.sql`**, que define `ai_workers_can_access`. A migração de ordenação `20261017010000_workers_message_order.sql` é separada. Essas alterações locais não confirmam implantação no banco publicado.

Para desativar as novas consultas, reverta primeiro o código consumidor e remova as funções públicas `workers_map_sales_overview(uuid,uuid,integer,date,date)`, `workers_agenda_personal_summary(uuid,date,date,text)` e `workers_agenda_people_ranking(uuid,date,date,integer)`; depois remova `workers_agenda_event_scope(uuid,date,date)` e `workers_require_read_scope(uuid)`. Nenhum dado comercial ou conversa é apagado por essa recuperação.

Não foram adicionados índices especulativos. O recorte utiliza os índices existentes de organização/data da Agenda, vínculos por usuário/evento e pedidos/itens por projeto/pedido. Tempo e plano no banco publicado devem ser medidos após a implantação autorizada; o tempo do PostgreSQL WASM não mede desempenho remoto.

## Evidência reproduzível com dados sintéticos

```powershell
node scripts/workers/analytics-db-qa.mjs --pglite-module '<caminho absoluto>/@electric-sql/pglite/dist/index.js'
npx vitest run src/lib/workers/__tests__/analytics.test.ts src/lib/workers/__tests__/registry.test.ts
```

`analytics-validation.json` registra doze verificações no PostgreSQL real em WASM, hashes dos SQL executados e resultados das três consultas de exemplo. A massa é identificada como sintética e tem mais linhas que o limite de uma listagem: 150 valores confirmados de R$ 100,00, um item confirmado sem valor, um item de R$ 100,00 aguardando assinatura, cancelamento, legado, outra edição e outra organização. A Agenda tem 124 eventos válidos após excluir um cancelado, múltiplos vínculos e um subevento, duração ausente e evento atravessando setembro/outubro. O ranking limita a apresentação a uma pessoa sem limitar sua contagem de 124 eventos.

A mesma execução aplica a migração de ordenação a um histórico sintético com horários iguais e UUIDs invertidos, verifica paginação por turno inteiro e comprova que concluir/repetir uma requisição idempotente conserva suas sequências. A fixture de RLS representa os limites de negócio para o teste; não substitui a validação do banco implantado ou de uma sessão autenticada real no navegador.

## Perguntas filtradas e distribuições completas

A migração incremental `20261017040000_workers_question_analytics.sql` acrescenta duas leituras especializadas:

- `workers_map_inventory_summary`: exige acesso ao BOT e `map.view`, considera apenas lotes ativos do projeto visível, filtra situação, quadra/pavilhão, área mínima/máxima, infraestrutura e ausência de número/área antes de contar e somar. Agrupa por situação ou quadra/pavilhão. Valores de área ausentes permanecem ausentes; área zero é válida. A edição só aparece quando a configuração comercial persistida a comprova, independentemente do nome ou da referência geométrica do projeto. Projeto ou edição ambíguos exigem esclarecimento.
- `workers_agenda_query`: exige acesso ao BOT e mantém as RLS da Agenda. Filtra período, situação, título, local, categoria, prioridade, dia da semana, comissão por UUID e relação pessoal; também responde sobre ausência de horário/local/categoria, eventos que atravessam a meia-noite ou o período e eventos que começam dentro dele. Cancelados são excluídos por padrão e podem ser consultados explicitamente. Agrupa por situação, local, categoria, dia da semana ou data de início.

`relationship='all'` significa todo o conjunto visível ao usuário. `linked` reúne criação e todos os vínculos pessoais persistidos de eventos/subeventos; `created` usa exclusivamente o UUID de quem criou; `responsible` usa `responsible_user_id` e vínculos marcados como principais (`is_primary`), inclusive em subeventos não cancelados. Papéis textuais livres e nomes não são usados para inferir identidade ou responsabilidade. Pertencer a uma comissão não significa ser participante de todos os seus eventos. O filtro explícito de comissão consulta `cronograma_evento_comissoes` com organização e UUID persistidos.

Os filtros booleanos são fechados e opcionais: `NULL` não restringe, `true` seleciona a condição e `false` seleciona seu complemento. São aplicados antes dos totais, grupos e amostra; a resposta conserva somente os filtros enviados, inclusive valores `false`.

| Filtro | Regra verificável |
| --- | --- |
| `missing_number` | Número do espaço nulo ou em branco; a saída conserva `number: null`. Nenhum número é inventado. |
| `missing_area` | Área nula, negativa ou não finita. Área zero permanece conhecida e não entra nessa condição. |
| `missing_time` | Falta um dos horários ou o intervalo normalizado não é positivo. Início igual ao fim no mesmo dia é inválido; o término anterior ao início no mesmo dia continua representando a madrugada seguinte, conforme a regra canônica. |
| `missing_location` / `missing_category` | Campo nulo ou em branco após remover espaços externos. A saída conserva ausência como `null`. |
| `cross_midnight` | Intervalo válido cujo fim ocorre em uma data local diferente da data de início. Horários ausentes ou duração inválida não comprovam esse cruzamento. |
| `cross_period` | Data de início anterior ao primeiro dia consultado ou data de fim posterior ao último dia. Usa o fim normalizado quando o intervalo é válido; na ausência de horários válidos, usa a data final persistida. Não presume duração ou presença. |
| `start_in_period` | A data de início persistida está entre os limites inclusivos. Diferencia eventos que começam no recorte de eventos que apenas o atravessam. |

As duas funções devolvem `scope`, `metrics`, `groups` e `rows`. `scope` inclui completude, data da consulta, fuso, filtros e agrupamento; a Agenda inclui período, e o Mapa inclui projeto e edição quando comprovada. `metrics` e `groups` são calculados sobre o conjunto filtrado inteiro. `rows` contém no máximo vinte exemplos, com campos permitidos, situações em português, nenhuma identidade privada e ordenação estável. Essa amostra não é um ranking de maiores áreas nem uma fonte de totais.

Até dezenove grupos são exibidos individualmente e os demais são consolidados em “Outros”, preservando a soma completa. Se um grupo original também se chama “Outros”, suas contagens são reunidas sem duplicar rótulos. A média de duração usa eventos com horários válidos e considera a duração agendada completa, com as mesmas regras das consultas pessoais. Grupos de data e dia da semana conservam o início persistido de eventos que atravessam o recorte.

```powershell
node scripts/workers/question-analytics-db-qa.mjs --pglite-module '<caminho absoluto>/@electric-sql/pglite/dist/index.js'
```

`question-analytics-validation.json` registra quatorze verificações adicionais no PostgreSQL WASM. Os exemplos sintéticos têm duzentos espaços ativos, vinte e cinco quadras, área conhecida de 1.990 m² e um espaço sem área, além de um lote arquivado e outra organização. A Agenda tem 124 eventos não cancelados, vinte e cinco locais e múltiplos vínculos. São verificados filtros antes da agregação, agrupamentos acima do limite visual, edição configurada, cancelamentos explícitos, vínculos UUID, RLS, área zero e leitura imediatamente posterior a uma atualização de situação e à inserção de um evento na fixture. Os booleanos são testados com ausências, campos em branco, duração zero, travessias de madrugada/período e combinações de `true`/`false`. A atualização entre leituras comprova ausência de cache nos leitores; não demonstra atualização automática de uma interface publicada.

A migração 400 depende da migração 200. Para revertê-la, após reverter os consumidores, remova `workers_map_inventory_summary(uuid,uuid,text,text,numeric,numeric,boolean,boolean,boolean,boolean,text,integer,boolean,boolean)` e `workers_agenda_query(uuid,date,date,text,text,text,text,text,text,text,integer,uuid,boolean,boolean,boolean,boolean,boolean,boolean)`. Ela não altera nem apaga dados ou políticas existentes.
