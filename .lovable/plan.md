# Acesso somente leitura: Jonas (Fotógrafo)

Criar a conta do Jonas com visão completa da Agenda Fenasoja, sem poder criar, editar ou excluir nada, e disponibilizá-lo na lista de pessoas responsáveis dos eventos.

## O que será feito

- **Conta**: `jmmirsan@gmail.com.br`, senha `Fenasoja@2028`, e-mail já confirmado.
- **Nome exibido**: `Jonas (Fotógrafo)`, cargo "Fotógrafo".
- **Perfil**: membro da organização FENASOJA com papel `leitura`.
- **Acesso**: apenas o módulo Agenda Fenasoja (Cronograma e Eventos), enxergando todos os eventos do ciclo.
- **Restrições**: sem Logística, Financeiro, Mapa Comercial, Restaurante e Arena, mobilidade ou administração.
- **Somente leitura**: nenhuma permissão de escrita — botões de criar/editar ficam indisponíveis e o banco recusa qualquer gravação vinda dele.
- **Lista de responsáveis**: por ter conta ativa com login, ele passa a aparecer como opção selecionável nos campos de responsáveis/convidados dos eventos.

## Detalhes técnicos

Provisionamento via edge function administrativa (mesmo padrão já usado para os demais usuários):

- `auth.admin.createUser` idempotente (atualiza senha/nome se já existir), `profiles` e `user_roles` (`user`).
- `org_members`: `role = 'leitura'`, `nome_exibicao = 'Jonas (Fotógrafo)'`, `cargo = 'Fotógrafo'`, `is_active = true`, `is_core_team = false`.
- `user_capabilities` (org FENASOJA): apenas `cronograma_eventos_access`.
  - Não conceder `cronograma_eventos_write` (bloqueia gravação nas policies e no `_cronograma_require_writer`).
  - Não conceder `cronograma_scoped_access` (assim ele vê todos os eventos, não só os vinculados).
  - Não conceder `full_access`, `logistica_access`, `financial_access`, `venue_*`, `map.*`, `mobility_access`.

RLS: as policies atuais de `cronograma_eventos` / `cronograma_subeventos` / tabelas relacionadas já permitem SELECT para membros da org sem escopo e exigem `admin/gestor/operador` ou `cronograma_eventos_write` para INSERT/UPDATE/DELETE — o papel `leitura` sem capability de escrita atende exatamente ao pedido, sem necessidade de novas policies.

## Validação

- Consultar `org_members` e `user_capabilities` do novo usuário para confirmar papel e capabilities.
- Confirmar que ele aparece em `list_org_login_members` (lista de responsáveis).
- Conferir que nenhuma capability de escrita ou de outros módulos foi atribuída.
