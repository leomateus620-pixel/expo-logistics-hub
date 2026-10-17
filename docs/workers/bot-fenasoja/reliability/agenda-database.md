# Agenda: banco observado, correção e recuperação

Inspeção em 17/10/2026, no projeto configurado `btfaumhroqtqzxomqorx`. O [registro de leitura](../live-readonly-preflight.json) não contém credenciais nem registros de negócio. Foram usados somente a configuração pública existente, projeções REST com `limit=0`, RPCs de metadados e chamadas sem sessão que não iniciam conversas.

## Evidência efetiva e limites

- `cronograma_eventos.responsible_user_id` não existe no banco publicado: a projeção isolada retornou HTTP 400, código PostgreSQL `42703`. As projeções dos campos usados pelas relações oficiais de eventos, subeventos, pessoas e comissões retornaram HTTP 200.
- As assinaturas fornecidas de `workers_agenda_event_scope`, `workers_agenda_query`, `workers_agenda_people_ranking`, `workers_agenda_personal_summary` e `workers_require_read_scope` resolvem no PostgREST; a execução anônima retorna `42501`. Isso confirma existência e bloqueio anônimo desses argumentos, não a definição completa da função nem todos os seus tipos/defaults.
- `audit_check_rls_status` confirmou RLS habilitada nas nove tabelas verificadas; `audit_count_policies` registrou as quantidades no JSON. A inspeção não recuperou expressões das policies, ACLs completas ou dependências remotas.
- O `workers-orchestrator` publicado respondeu com `invalid_request` a `{}`. A resposta veio da validação da aplicação, sem iniciar um turno. Não foi possível baixar sua implementação ou verificar hash do registry publicado.
- A raiz OpenAPI negou acesso (401), o projeto histórico não estava acessível ao conector Lovable (404) e não havia acesso autenticado de gerenciamento utilizável no CLI. O processo CLI já encerrou. Não houve migration ou deploy remoto.

O código das migrations 200/400 usa a coluna ausente. A fixture antiga também a criava, ocultando a incompatibilidade. A nova fixture remove esse campo, executa as migrations anteriores em isolamento e comprova `42703` antes de aplicar a correção incremental. Não se afirma que o corpo remoto é idêntico ao código versionado: essa comparação continua dependendo de acesso de administração.

## Regras adotadas

Pessoas são identificadas pelo UUID em `cronograma_evento_responsaveis.org_member_user_id` e `cronograma_subevento_responsaveis.org_member_user_id`. Um vínculo principal (`is_primary`) conta também como responsabilidade. Vários vínculos da mesma pessoa no mesmo evento principal contam uma vez. Subeventos cancelados não acrescentam vínculo; os demais são reunidos no evento principal. Criar um registro é uma métrica separada e não acrescenta participação a `linked` nem ao ranking. Ausência de UUID não é resolvida por nome.

O nome atual vem de `org_members.nome_exibicao`, com snapshot autorizado como fallback quando o cadastro está ausente ou vazio. O fallback mantém o mesmo UUID. Homônimos podem ter nomes idênticos e identidades diferentes, sem rejeição da consulta. A consulta nominal usa o UUID resolvido e não substitui a pessoa pelo chamador.

Comissões reúnem as relações principais/adicionais de eventos e subeventos, `commission_slug` persistido e os slugs em `linked_commissions`. A união acompanha o filtro de comissões em `src/lib/cronograma-eventos.ts` e `relatedCommissionIds` em `modelAdapter.ts`. Slugs só são aceitos quando resolvem uma comissão oficial da mesma organização; não há associação aproximada por nome. `origin_commission_id` descreve origem e não cria participação. O agrupamento usa UUID e evento principal distintos, antes do limite visual. A soma por comissão pode ultrapassar a quantidade de eventos distintos.

Período, sobreposição de datas, virada da meia-noite, duração agendada, exclusão padrão dos cancelados e eventos sem data seguem os leitores existentes. Esses resultados descrevem vínculos e agendamento, sem presumir presença. A equivalência remota com Agenda/Dashboard, incluindo os indicadores comerciais 124/60/64 quando ainda vigentes, não foi homologada por ausência de sessão autorizada.

## Alteração incremental

`20261017050000_workers_agenda_relationships.sql` usa uma transação e contém somente funções de leitura. Corrige os quatro leitores existentes preservando suas assinaturas e cria cinco leitores auxiliares/especializados. `workers_agenda_event_scope` conserva o campo de retorno `responsible_user_id` por compatibilidade, derivado da relação principal com junção de conjunto; nenhuma coluna é acrescentada à tabela.

Todos os nove leitores são `SECURITY INVOKER`, usam `search_path` fechado e reconfirmam `workers_require_read_scope`. As funções novas revogam execução de `PUBLIC`/`anon` e concedem a `authenticated`. `CREATE OR REPLACE` conserva as ACLs dos leitores existentes. Não há alteração de RLS, tabela de negócio, identidade, evento ou histórico.

Para implantação, exportar primeiro as definições e ACLs efetivas dessas funções com acesso administrativo, comparar as assinaturas com esta migration e guardar o resultado em arquivo restrito. Aplicar somente as migrations corretivas novas após revisão; não repetir 200/400 nem recriar estruturas já presentes. Publicar consumidores e Edge em conjunto com o contrato novo, depois comparar as consultas simultâneas com o módulo oficial usando a mesma sessão e o mesmo recorte.

Para recuperação, reverter primeiro os consumidores para uma versão compatível e restaurar somente as funções modificadas usando o snapshot de definições/ACLs coletado antes da implantação. Remover os cinco leitores novos somente após desligar seus consumidores. A volta exata aos leitores 200/400 repõe a falha conhecida de coluna ausente; a alternativa operacional é manter a correção de relações e desativar as novas estratégias. Nenhuma recuperação exige apagar dados ou recriar a coluna antiga.

## Verificação local

- `analytics-db-qa.mjs`: **19 verificações** em PostgreSQL WASM, com papéis autenticado/anônimo e RLS de fixture. Inclui reprodução da falha antiga, homônimos, busca nominal, fallback de snapshot, criador sem vínculo, subeventos, agregação completa, vínculo de comissão duplicado, JSON legado e execução invoker.
- `question-analytics-db-qa.mjs`: **15 verificações** de filtros e agregações completas, agora contra a fixture sem a coluna obsoleta e a migration corretiva.
- `src/lib/workers/__tests__/analytics.test.ts`: **15 testes** passando; valida também os resultados reais das fixtures SQL, as novas formas de resposta e a separação de falha de validação/acesso.

Os JSONs de validação registram hashes dos SQL executados e exemplos sintéticos. Esses testes não comprovam valores reais, desempenho remoto, configuração publicada ou operação em iPhone.
