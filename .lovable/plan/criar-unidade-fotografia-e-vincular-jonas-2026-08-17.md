# Criar unidade "Fotografia" e vincular Jonas

## O que será feito

- Criar uma nova unidade organizacional chamada **Fotografia** no registro oficial de Comissões e Assessorias (mesma lista usada pela Agenda Fenasoja e pela Agenda Restaurante e Arena), como assessoria, ativa e oficial, no fim da ordem de exibição.
- Vincular **Jonas (Fotógrafo)** como responsável principal dessa unidade, usando o usuário já existente dele (não será criado usuário novo).
- Registrar Jonas também como membro dessa unidade, para que a unidade apareça corretamente nos seletores de comissões/responsáveis dos eventos.
- A estrutura já suporta mais pessoas depois: basta adicionar novos responsáveis à mesma unidade.

## Detalhes técnicos

- Migração SQL na tabela `public.commissions`: novo registro `nome = 'Fotografia'`, `slug = 'fotografia'`, `unit_type = 'assessoria'`, `is_official = true`, `is_active = true`, `display_order` no fim da lista de assessorias, `org_id` da organização FENASOJA.
- Inserção em `public.commission_responsibles`: `display_name = 'Jonas (Fotógrafo)'`, `user_id = 3e7f410c-…`, `responsible_type = 'pessoa'`, `relationship_role = 'principal'`, `is_primary = true`, `active = true`.
- Atualização de `public.org_members.commission_id` do registro do Jonas para a nova unidade (mantendo `role = 'leitura'` e o escopo restrito de eventos já configurado).
- Nenhuma alteração de código de frontend é necessária — `useOrgCommissions` já lê essas tabelas dinamicamente.

## Observação

O acesso do Jonas continua restrito: ele só verá eventos em que estiver vinculado (capability `cronograma_scoped_access`). O vínculo à unidade Fotografia passa a permitir também os eventos atribuídos a essa unidade.
