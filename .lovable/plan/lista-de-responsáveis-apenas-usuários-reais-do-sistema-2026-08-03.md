# Lista de responsáveis: apenas usuários reais do sistema

Hoje o seletor "Responsáveis do evento" lista todos os registros de equipe, incluindo cerca de 40 voluntários que nunca tiveram conta criada (têm e-mail interno do tipo `placeholder-...@noaccess.local`). Por isso aparecem nomes como "ALEXANDRE DALL'AGNESE — VOLUNTÁRIO".

## O que muda

O grupo "Membros do sistema" passa a mostrar somente quem realmente já acessou o sistema (14 pessoas hoje):

Cléo — FENASOJA Feira, Djeison Drey, Eduardo Santos, Fernanda Secklereich, Leonardo Mateus Stroschein, Lucas Franken, Luis Fernando Furlanetto, Marcelo de Bairros, Micael Arcanjo Böck, Mobilidade Fenasoja, Ricardo Carpenedo Caetano, Ricardo Emilio Zimmermann, Soltis, Zélia Savoldi.

Contas duplicadas da mesma pessoa (ex.: "ZÉLIA SAVOLDI" com e-mail corporativo sem acesso e "Zélia Savoldi" que já acessou) ficam reduzidas à conta ativa que realmente faz login.

Segue possível digitar um nome livre para quem não tem usuário, e o grupo "Responsáveis institucionais" (presidentes das comissões) continua disponível como hoje.

## Detalhes técnicos

1. Migration: criar função `public.list_org_login_members(_org_id uuid)` (SECURITY DEFINER, `search_path = public`), que junta `org_members` ativos com `auth.users` e retorna apenas linhas com `last_sign_in_at is not null` e e-mail que não seja `%@noaccess.local`. Acesso restrito: `GRANT EXECUTE ... TO authenticated`, com verificação interna `public.is_org_member(auth.uid(), _org_id)`. Retorna `user_id, nome_exibicao, cargo, role, last_sign_in_at` — sem expor e-mail.
2. `src/hooks/useOrgMembers.ts`: adicionar um retorno extra `loginMembers` (nova query via RPC), mantendo `members` intacto para os demais módulos que dependem da lista completa.
3. `src/components/cronograma-eventos/EventForm.tsx`: montar o grupo "Membros do sistema" a partir de `loginMembers` em vez de `members`, mantendo a deduplicação por nome normalizado e a ordenação alfabética.
4. O auto-preenchimento do campo "Responsável" com o usuário logado continua funcionando (busca o nome primeiro em `loginMembers`, com fallback no metadata do usuário).
