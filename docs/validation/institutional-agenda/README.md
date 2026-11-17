# Agenda institucional — validação de 17/11/2026

A correção usa um evento canônico em `cronograma_eventos`, com a mesma RPC `cronograma_save_event` para as comissões, assessorias e Agenda Fenasoja. O banco foi atualizado pelo **Lovable `query_database`**, sem mensagens no chat do projeto. O frontend está nesta PR; os testes de navegador usaram o código local conectado ao banco real. Sua publicação depende do merge/deploy da PR.

## Diagnóstico e correção

Bruna está vinculada a **Acolhimento e Bem Comum**, como responsável `principal`, com papel organizacional `leitura` e sem escrita global. O acesso ao módulo reconhecia esse vínculo, mas a cadeia de salvamento canônica exigia escrita global em etapas posteriores. Paralelamente, `void submitEvent(...)` descartava a Promise: o formulário podia fechar antes de saber se o banco havia salvo.

Essas falhas estruturais foram verificadas no código e nas funções implantadas. Não há um trace da requisição original da Bruna para afirmar qual resposta HTTP ocorreu naquela tentativa. A autorização atual do vínculo real foi consultada sem alterar sua conta; a reprodução de escrita usou identidades de teste com o mesmo perfil de permissão. [Evidência do vínculo](reporter-permissions.json).

Outras falhas corrigidas:

- Seleções não resolvidas eram descartadas; agora geram erro e preservam o formulário.
- A identidade da unidade podia depender da ordem do diretório. A resolução agora prioriza registros oficiais e não legados, usa UUIDs reais e rejeita ambiguidades.
- A edição por outra unidade podia substituir a proprietária. Origem, principal, versão e relacionamentos não alterados são preservados no frontend e protegidos no servidor.
- A linha do tempo escondia eventos sem Comissão Central, enquanto outros indicadores os contavam. Todas as visualizações gerais usam os eventos autorizados pelo servidor; a participação da Central continua sendo um filtro, não uma exigência artificial.
- O diretório limitado da unidade foi substituído pelo mesmo diretório institucional da Agenda Fenasoja, com `person_id`, fotos, função e unidade. Pessoas sem login e convidados externos explicitamente adicionados são preservados.
- Os quatro locais fixos usam o mesmo `EventLocationField` e os mesmos códigos oficiais. Locais antigos em texto livre continuam intactos. O encaminhamento do Centro de Eventos ao Restaurante foi preservado e testado.
- A invalidação agora alcança todas as agendas e métricas da organização, inclusive unidades removidas. O cache recebe apenas o retorno confirmado do servidor; consultas sensíveis usam organização/usuário e não persistem localmente.
- A consulta principal pagina os resultados, cobrindo bases acima de 1.000 registros. Eventos antigos sem data permanecem disponíveis como “Data a definir”. Links novos usam o ID persistido; links antigos por `source_key` continuam aceitos.
- A edição do evento principal no workspace da Agenda Fenasoja reconhece a permissão específica do evento, sem conceder gerenciamento de subeventos.
- O resumo pessoal semanal inclui os convites de sábado e domingo; as identidades de seus links são canônicas.
- Operadores com `restricted_scope` herdavam escrita global do helper genérico de capabilities. O cálculo da Agenda passou a consultar os grants explícitos; escrita/exclusão global não é adquirida pelo marcador de restrição.

## Persistência, segurança e implantação

Migrations aplicadas e registradas em `supabase_migrations.schema_migrations`, com texto, checksum e rollback:

| Migration | Aplicação UTC | Evidência |
| --- | --- | --- |
| `20261117120000_institutional_agenda_integrity` | 17:10:46 | [Aplicação e checksums](application.json) |
| `20261117124500_agenda_restricted_operator_scope` | 17:31:21 | [Aplicação](restricted-operator-application.json) |

Foram ajustadas a RPC canônica, as etapas privadas de início/fim da transação, os aplicadores de pessoas/unidades, o guard de origem, a autorização do encaminhamento ao Restaurante e as políticas das tabelas de eventos, comissões relacionadas, responsáveis e logs. A nova RPC `cronograma_agenda_permissions` fornece as permissões efetivas ao frontend.

RLS permanece habilitada. As políticas usam conjuntos de IDs calculados por consulta, incluindo a condição sobre a própria linha necessária para `INSERT ... RETURNING`. A RPC continua transacional, com recibo de idempotência, `source_key`, lock otimista e auditoria de valores anteriores/novos, incluindo relacionamentos. Não foram criadas tabelas paralelas de eventos nem concedidos privilégios globais a contas reais. Execução anônima dos endpoints de mutação foi revogada.

A matriz foi exercitada no servidor, com `auth.uid()` de usuários sintéticos e papel SQL `authenticated`, sem executar as operações como administrador do banco:

| Perfil | Criar/editar | Excluir | Visibilidade |
| --- | --- | --- | --- |
| Administrador / gestor | Escopo organizacional existente | Conforme autorização global existente | RLS, incluindo restrições de planejamento |
| Operador sem restrição | Autoridade operacional existente | Autoridade existente | Escopo existente |
| Operador restrito | Unidades em que possui vínculo autorizado; global somente com grant explícito | Sem grant global: negado, inclusive por DELETE direto | Conforme RLS |
| Principal / corresponsável / copresidente, mesmo com papel `leitura` | Sua unidade; edição de evento cuja proprietária ou participante é uma unidade gerenciada | Não recebe exclusão global | Eventos autorizados |
| Integrante de apoio com papel `leitura` | Negado | Negado | Eventos pertinentes |
| Convidado | Não ganha edição pelo convite | Negado | Evento convidado; suas outras unidades não são vinculadas automaticamente |
| Usuário de outra organização | Negado | Negado | Nenhum acesso cruzado |

Rollback de infraestrutura: executar primeiro [rollback do operador restrito](rollback-restricted-operator.sql), depois [rollback principal](rollback.sql). Esses scripts restauram as definições anteriores e removem somente os registros das duas migrations; não apagam eventos. Como restauram regras anteriores, devem ser usados apenas em uma reversão deliberada.

## Evidências e cobertura

- **152 cenários no banco real:** 38 unidades ativas × 4 locais, usando nomes/pessoas reais do diretório, preservando todos os `person_id` escolhidos, horários, ID canônico, leitura nas unidades e integração com a Central. Incluem unidades legadas ativas, Central e CCPF. Unidades sem equipe cadastrada receberam um convidado real da Central; nenhum integrante real foi movido de unidade. As gravações e os vínculos do ator sintético foram revertidos na mesma transação. [Resultado completo](deployed-final-regression.json).
- **26 verificações de autorização/integridade:** criação como principal sem escrita global, leitura e edição pela unidade participante, convidados sem conta, idempotência, conflito de versão, origem imutável, seleção inválida com rollback, leitores, acesso entre organizações, operador restrito, DELETE direto e manutenção de RLS. Mesmo arquivo de evidência.
- **33 rotas oficiais no navegador:** criação, seleção de duas pessoas, vínculo com Central, salvamento, recarga, abertura pelo ID e aliases dos módulos especializados. Conta real de teste, papel `leitura`, sem escrita global, com vínculo principal temporário em uma organização isolada. [Rotas e IDs](browser-live.json).
- **Edição bidirecional:** a Assessoria de Marketing editou um evento de Acolhimento; depois o mesmo evento foi editado pela Agenda Fenasoja sem permissão global. Mantiveram-se origem, três frentes e duas pessoas, e a alteração reapareceu na unidade e no calendário. [Evidência](browser-central-edit.json).
- **Desktop e celular:** Chrome, 1440×1050 e 390×844, fuso `America/Sao_Paulo`; segundo contexto de navegador e nova autenticação. Sem rolagem horizontal. [Desktop](desktop-central.png), [celular](mobile-persisted.png), [formulário móvel](mobile-form.png).
- **Resposta perdida após COMMIT:** a primeira resposta da RPC foi descartada propositalmente depois da gravação real. O formulário permaneceu aberto e preenchido; a repetição manteve `request_id`, `source_key` e ID, preservou o convidado externo e o Auditório, e reapareceu após recarga. [Resultado](browser-retry.json), [erro preservando campos](mobile-retry.png), [registro salvo](mobile-retry-saved.png).
- **Limpeza:** os 35 eventos gravados de forma durável para a homologação, a organização isolada, suas 38 unidades, pessoas e conta foram removidos. As transações com dados reais foram sempre revertidas. [Limpeza](cleanup.json).
- **Preservação:** checksums finais idênticos aos iniciais para as dez tabelas auditadas: 348 eventos, 39 unidades, 60 pessoas, 64 vínculos de equipe, 419 vínculos de unidades em eventos, 630 responsáveis, 505 logs, 35 anexos e seis subeventos. [Comparação final](preservation-final.json).

As rotas `/comissoes/:moduleSlug/agenda` são institucionais, inclusive nos portais especializados. A agenda operacional da Logística continua em `/comissoes/logistica/agenda-operacional` e `/agenda`. A Agenda Fenasoja permanece em `/cronograma-eventos`. Financeiro Gerencial e os demais módulos sensíveis conservam seus guards; CCPF e Central não receberam portais artificiais.

## Validações automatizadas

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build` | Passou; avisos existentes sobre tamanho dos bundles |
| Testes focados finais | 129 passaram em 11 arquivos |
| `npm test` completo | 4.470 passaram; 88 falharam, as mesmas 88 falhas da base `origin/main`; nenhuma nova assinatura de falha |
| `npm run lint` | Falha preexistente: 1.077 erros/150 avisos na base; checkout tem 1.105/174 por caches locais anteriores fora da PR. Nenhum novo diagnóstico em `src/` |
| `git diff --check` | Passou |

O teste de fim de semana foi acrescentado após a execução completa e incluído na execução focada final. A comparação de falhas e diagnósticos está em [test-results.json](test-results.json). A compilação não foi usada como substituto dos testes de persistência.

Para repetir a homologação SQL, em uma única conexão, executar `BEGIN`, depois os arquivos `scripts/institutional-agenda/transactional-tests.sql`, `authorization-tests.sql` e `all-units-tests.sql`, e finalizar obrigatoriamente com `ROLLBACK`. Eles usam o UUID da organização deste projeto, nunca devem ser commitados e não enviam notificações fora da transação. As migrations já devem estar implantadas.

## Auditoria e limites

A auditoria encontrou 115 eventos históricos sem relação principal, 30 sem data e oito grupos com título/data/horário coincidentes. Não se comprovou que esses grupos eram duplicações; não houve exclusão, recriação ou atribuição presumida de proprietários. Não foram encontrados `origin_commission_id` inválidos, referências quebradas de pessoa/conta ou `source_key` duplicado. Dois eventos de unidade eram ocultados pelo filtro antigo da Central. [Auditoria inicial](agenda_audit_before.json), [auditoria expandida](agenda_audit_expanded.json).

O editor institucional rejeita claramente um evento antigo sem proprietária identificável; uma correção de cadastro desses registros precisa de evidência institucional antes de qualquer backfill. Os documentos, transcrições e relatórios existentes não foram editados. Entrega de e-mail, push e Google Calendar não foi acionada para pessoas reais durante a homologação; suas filas e integrações foram preservadas.

Não foi usada a sessão pessoal da Bruna. Seu vínculo e autorização foram conferidos em produção; a escrita foi reproduzida com a mesma classe de permissões, conforme descrito acima. O site publicado ainda precisa receber o frontend da PR.

## Arquivos

[Lista completa dos arquivos da entrega](changed-files.txt). Os principais grupos são `CommissionWorkspacePage`, os componentes/adaptadores da agenda institucional, `useUnitAgenda`, `useAgendaPermissions`, `useCronogramaEventos`, `cronograma-rpc`, as rotas/menus, o cache por identidade, as duas migrations e os testes SQL/React.
