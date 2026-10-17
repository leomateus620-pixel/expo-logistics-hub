# BOT FENASOJA: diagnóstico e respostas verificáveis

Diagnóstico inicial em `main`, commit `725f57342b0fdbc1344b5590121af6543afff3f2`; implementação na branch `codex/bot-fenasoja`. Foram lidos os `AGENTS.md` da raiz e de `src/features/workers`. O `package-lock.json` já estava alterado antes deste trabalho.

## Causas confirmadas no backend

- `engine.ts` chamava `renderToolEvidence(results)` sem informar pergunta, intenção ou nome da ferramenta. A função percorria cada resultado e publicava uma seção independente, incluindo consultas de descoberta como `map_projects`. Isso reproduz a tabela de projeto e “Is archived” nas capturas enviadas.
- `buildTable` completava as colunas com qualquer campo escalar encontrado e transformava nomes desconhecidos apenas trocando sublinhados. Estados em maiúsculas, como `SALE_OPEN` e `CONFIRMED`, escapavam da tradução. Essa era a origem de “Kind”, “Reference” e “Item count”.
- `buildChart` contava estados em `result.records` sem verificar `truncated` ou comparar `total` com o tamanho retornado. Um resultado de dois registros e total 113 gerava um gráfico de dois registros. Havia até um teste exigindo esse comportamento: ele agora exige ausência de gráfico e aviso explícito de amostra.
- `buildPlannerMessages` tinha histórico textual, mas nenhuma representação persistida do período efetivamente consultado, métrica ou filtro pessoal. A escolha da edição dependia do planejador, e a tela podia influenciar uma seleção incorreta.
- O conteúdo era transmitido em fatias fixas de 96 caracteres, inclusive os JSONs visuais. O novo envelope validado é enviado inteiro depois da persistência, impedindo blocos parciais.
- A redação de proteção de dados era aplicada sobre o JSON serializado, tanto no banco quanto no cliente. Isso podia alterar URLs verificadas e números longos que coincidissem com formatos de documento ou telefone. A migration incremental preserva fatos numéricos, UUIDs e datas tipados, valida as fontes contra as citações já conferidas e continua protegendo os campos textuais.

A inversão pergunta/resposta, os estilos responsivos e a marca também têm causas no frontend. A correção da ordem usa turnos ligados por `request_id`, recuperação consistente e composição final sem segunda ordenação por UUID; veja os arquivos de ordem da conversa e as evidências da interface desta entrega.

## Fluxo final

1. O orquestrador valida JWT, identidade, organização, capabilities e `ai_workers_can_access`, como antes. Todas as ferramentas continuam usando o cliente público com o JWT do solicitante.
2. O histórico autenticado é recuperado em ordem de turnos. `interpretWorkerIntent` resolve especialista, intenção, edição explícita, período civil em `America/Sao_Paulo`, apresentação e relação pessoal. Uma referência explícita prevalece sobre tela e histórico.
3. As consultas de vendas, Agenda pessoal e ranking são escolhidas deterministicamente. O modelo não participa do cálculo nem da redação desses números. O projeto vem de configuração persistida; uma escolha ambígua produz uma pergunta curta. Uma resposta com o nome exato de um projeto é resolvida contra `map_projects` autorizado, internamente. Perguntas de continuidade preservam o projeto validado, edição, período e relação pessoal; uma nova edição explícita força nova resolução.
4. Outros especialistas usam apenas as ferramentas autorizadas de seu domínio. O planejador recebe a intenção interpretada e os resultados como dados não confiáveis. Ações continuam propostas pendentes de revisão, sem executar confirmação ou alteração pelo chat.
5. `composeWorkerResponse` seleciona a consulta principal e aplica composição determinística específica. Descobertas de projetos, entidades, segmentos e edições não viram tabelas de resposta automaticamente. A alternativa a uma agregação ausente é informar que não foi possível calcular o indicador, nunca somar uma listagem parcial.
6. O contrato Zod estrito valida envelope, versão, metadados, blocos, células, valores finitos, unidades, cardinalidade, nomes distinguíveis e completude de gráficos. O banco também valida a gramática limitada e sanitiza valores textuais sem reescrever JSON.
7. A conclusão é salva com as citações, uso e auditoria existentes. Só então um documento completo é emitido para o lugar reservado abaixo da pergunta. Repetições idempotentes reproduzem o mesmo conteúdo persistido, sem nova consulta.

## Contrato e compatibilidade

`response-contract.ts` compartilha os mesmos schemas entre Edge e React. O formato persistido é um bloco `fenasoja-response`, versão 1, com resumo, especialista/intenção, organização/edição/projeto, período, escopo, atualização, completude e notas. Os blocos permitidos são resumo, indicadores, barras horizontais, tabela, comparação, perfil, fontes, vazio e esclarecimento. Não existe configuração executável de componente, gráfico, SQL ou HTML.

As tabelas legadas `fenasoja-table` e os gráficos legados `fenasoja-chart` permanecem legíveis. `renderToolEvidence` permanece como adaptador para rotinas antigas, usando colunas positivas e sem gráficos calculados sobre amostras. Novas respostas do chat utilizam `composeWorkerResponse`, com nome e argumentos da consulta preservados até a composição.

`20261017030000_workers_response_persistence.sql` substitui apenas o tratamento do conteúdo em `ai_workers_finish_turn`, preservando checks de usuário/organização, estado, idempotência, citações e auditoria. Os novos auxiliares estão no schema privado e não podem ser chamados por `authenticated`. A recuperação consiste em restaurar a definição anterior de `ai_workers_finish_turn` antes de remover os auxiliares; as conversas antigas não são reescritas.

## Significados comerciais e da Agenda

- Pedido e espaço comercial são unidades diferentes; um pedido pode ter muitos itens. Um pedido parcial pode aparecer entre os que contêm itens confirmados e entre os que contêm itens abertos. Não se somam essas categorias como se fossem pedidos exclusivos.
- Vendas realizadas exibem o subtotal dos itens cuja confirmação oficial está verificada; vendas em andamento exibem itens ainda abertos. Contrato anexado não comprova assinatura. Os valores não são recebimentos e não incluem taxas gerais do pedido.
- Itens cancelados não entram nos valores ativos. Históricos, confirmação não verificável, edição não comprovada, valores ausentes e datas ausentes recebem tratamento e notas próprios. A edição comercial vem da regra persistida do item/configuração; o ano da referência geométrica do projeto não comprova a edição comercial.
- Quando solicitado um mês para vendas, confirmados são filtrados pela data de confirmação e itens que continuam abertos pela data de criação, em São Paulo. Isso representa a situação atual desses itens; não se apresenta como uma fotografia histórica do saldo em aberto naquele mês.
- Agenda pessoal resolve a identidade autenticada e as relações persistidas, deduplicando eventos. “Criados”, “responsáveis” e “vinculados” são conceitos distintos. Presença efetiva não é deduzida de nenhum deles; pedidos de presença recebem essa explicação e um caminho de consulta útil.
- A duração é prevista e considera o evento completo, inclusive atravessamentos de dia ou mês. O denominador com horários válidos é informado quando parcial. Evento com data passada não é automaticamente realizado. Ranking usa agregação completa autorizada, conta eventos distintos por pessoa e mantém desempate determinístico e nomes distinguíveis.

As regras SQL e os testes de agregação estão documentados no relatório de analytics desta mesma entrega.

## Especialistas preservados

| Especialista | Escolha e apresentação |
| --- | --- |
| Agenda | Eventos, detalhes, subeventos, comissão; agregados pessoais e ranking completos. |
| Arena | Disponibilidade e conflitos respondem diretamente sobre o intervalo; ocupação e contrapartidas mantêm suas unidades. |
| Mapa | Panorama de vendas agregado por projeto/edição; inventário, preços e contratos continuam consultas distintas. |
| Interesse | Visitas, sessões, seleções e detalhes por área; gráfico solicitado somente se a consulta agregada estiver completa. |
| Comissão | Vínculos persistidos, responsáveis, reuniões consentidas, ações e indicadores da comissão. |
| Logística | Transportes, frota, carrinhos, patinetes, escalas e snapshots de clima conforme o pedido. |
| Caixa | Projetado, comprometido/confirmado, pago, recebido, execução e comparação preservam significado; centavos viram reais uma única vez. Saldo explicita movimentos registrados. |
| Radar | Fontes primárias públicas; snippets não viram prova de perfil institucional. |

## Evidência institucional

A publicação oficial [Definidas data e comissão central da Fenasoja 2028](https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/) foi consultada ao vivo nesta implementação. O conteúdo identifica Fabiano Soltis como presidente da edição 2028. O timestamp de publicação `2026-09-09T01:40:13+00:00` corresponde a **08/09/2026** em São Paulo.

`readInstitutionalPresident` consulta o conteúdo integral de uma URL revisada, fixa, sem aceitar URL do usuário/modelo, sem redirects e com limite real de bytes. Nome, papel, edição e publicação são extraídos da nomeação explícita, não fixados em um cadastro eterno. Alteração no texto ou ausência dessa evidência produz resposta insuficiente. O perfil identifica edição, publicação e data da verificação; não afirma nascimento, profissão ou duração de mandato. A fotografia da matéria é coletiva e não comprova a identidade de uma pessoa isolada, portanto não foi usada como retrato. Sem uma edição explícita, a fonte deixa de comprovar presidência atual após 2028.

A página genérica [Comissão Central](https://fenasoja.com.br/comissao-central/) ainda exibia outra composição ao ser consultada. Isso confirma a necessidade de vincular a afirmação à edição e à publicação datada.

## Testes e limites da evidência

`src/test/workersResponses.test.ts` verifica intenção e período civil, edição explícita, continuidade de filtros/projeto, agregados maiores que o limite de listagem, pedidos/itens distintos, centavos, ausência de valores, descoberta escondida, esclarecimento resolvível, Agenda sem presença presumida, duração parcial e dias de maior concentração, ranking e empates, contrato inválido e emissão atômica após persistência. Os testes existentes de orquestração continuam verificando JWT/allowlists, ferramentas proibidas, dados não confiáveis, cancelamento, falhas, fontes e replay idempotente.

`scripts/workers/response-db-qa.mjs` executa a migration real em PostgreSQL/PGlite descartável com dados sintéticos: número `12345678901` e URL institucional sobrevivem intactos; e-mail textual é protegido; tabela inválida, fonte divergente, organização divergente e versão/especialista/completude ausentes são rejeitados; conteúdo legado e idempotência permanecem; auxiliares privados não são executáveis pelo cliente. Resultado em `evidence/response-persistence-qa.json`.

Essas evidências são locais e sintéticas. A revisão visual autenticada contra dados reais, a implantação das migrations e da Edge Function e a validação das políticas remotas permanecem etapas de ativação do ambiente; nenhum teste local comprova produção ou dispositivo físico.
