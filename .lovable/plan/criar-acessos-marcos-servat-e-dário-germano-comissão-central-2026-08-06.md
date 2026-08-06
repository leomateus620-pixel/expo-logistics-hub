# Criar acessos: Marcos Servat e Dário Germano (Comissão Central)

Dois novos logins com senha `Fenasoja@2028` (e-mail já confirmado), vinculados à Comissão Central e com acesso aos módulos do sistema. Marcos recebe adicionalmente o Financeiro Gerencial.

## Usuários

| Nome | E-mail | Perfil | Financeiro |
| --- | --- | --- | --- |
| Marcos Eduardo Servat | tenservat@gmail.com | gestor | Sim |
| Dário Júnior da Motta Germano | advdariogermano@gmail.com | gestor | Não |

Hoje ambos existem apenas como cadastros de voluntário (perfil "leitura", sem login). Esses registros antigos serão desativados para não duplicar a pessoa nas listas, e o novo login passa a ser o registro oficial: nome padronizado, perfil gestor, marcado como equipe 2028 (aparece em "Membros do sistema").

## Acessos liberados

Mesmo conjunto de menus já concedido ao Roque Lugoch: logística, cronograma e eventos, eventos restaurante e arena, mobilidade, mapa comercial, portais Exporural e Indústria/Comércio/Serviços e demais comissões.

- Dário: tudo isso, sem Financeiro Gerencial.
- Marcos: o mesmo conjunto mais a permissão financeira explícita, que hoje é o que libera o Financeiro Gerencial.

## Comissão Central

Os dois entram como responsáveis da Comissão Central, com o vínculo ligado ao usuário real (Marcos já consta na lista da Central; o registro será reapontado para o novo login e o Dário será incluído).

## Detalhes técnicos

- Provisionamento pela função administrativa existente `provision-fenasoja-users`: acrescentar as duas entradas ao array `USERS` (com `capabilities`, `is_core_team`, `deactivate_duplicates` para os nomes legados "MARCOS EDUARDO SERVAT" e "DARIO JÚNIOR DA MOTTA GERMANO") e executar uma vez com o token de worker. A função já é idempotente (cria ou atualiza senha/nome).
- Marcos recebe também a capability `financial_access`, exigida por `resolveModuleAccess` em `src/hooks/useModuleAccess.ts` para módulos sensíveis.
- Dados: `UPDATE`/`INSERT` em `commission_responsibles` para a comissão `central` com `user_id` do novo login; `org_members.commission_id` apontando para a Comissão Central.
- Nenhuma alteração de schema é necessária.

## Validação

- Login com cada conta: sidebar completa; Financeiro Gerencial visível apenas para o Marcos.
- Lista de membros do sistema sem nomes duplicados.
- Comissão Central exibindo os dois como responsáveis no Cronograma e Eventos.
