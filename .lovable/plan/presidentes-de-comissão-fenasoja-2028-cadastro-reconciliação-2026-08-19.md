# Presidentes de Comissão Fenasoja 2028 — cadastro, reconciliação e vínculos

## O que a planilha traz

46 registros válidos (linhas 3 a 48 da aba `Plan1`), com Comissão/Função, Nome completo, Fone/Celular, e-mail e data de nascimento. Todos serão tratados; nada será inventado.

## O que já existe no sistema (verificado agora)

- A regra de visibilidade pedida **já está implementada**: a política de SELECT de `cronograma_eventos` usa `cronograma_scoped_event_visible`, que libera o evento quando o usuário é responsável direto (`cronograma_evento_responsaveis`) **OU** quando é responsável de uma comissão vinculada ao evento (`cronograma_evento_comissoes` + `commission_responsibles`). Nada de ILIKE, texto livre ou categoria. Não será criada camada nova.
- O escopo restrito é ativado pela capability `cronograma_scoped_access` (tabela `user_capabilities`) — mesma arquitetura já usada por Bruna, Jonas e Germano.
- O registro relacional Comissão ↔ Pessoa é `commission_responsibles` (`commission_id` + `user_id`), e é exatamente essa tabela que alimenta o seletor "Pessoas responsáveis".
- Existem 38 comissões em `commissions` e 49 vínculos ativos em `commission_responsibles` — a maioria dos presidentes da planilha **já está vinculada**, porém apontando para usuários "placeholder" (`placeholder-…@noaccess.local`), criados apenas para segurar o vínculo, sem login real.
- Conferindo os 46 e-mails da planilha contra o Auth, apenas 4 batem exatamente: Fabiano Soltis, Djeison Drey, Cléo (`cleo@fenasoja.com.br`) e Bruna. Os demais presidentes que já usam o sistema estão logados com **outro e-mail** (ex.: Marcos Servat com `tenservat@gmail.com`, Germano com `germanotbuttow@gmail.com`, Zélia com `zelia.savoldi@hotmail.com`).

## Decisões de reconciliação

1. **Usuário real já existente (login ativo)** — não recriar, não trocar senha, não mexer em role, capabilities, RLS ou módulos. Se o e-mail de login for diferente do e-mail da planilha, **o login atual é preservado**; o e-mail da planilha entra apenas como dado de contato. Atualizo só WhatsApp e nascimento quando faltarem.
2. **Vínculo existente apontando para usuário placeholder** — o placeholder é **promovido** a conta real (define-se o e-mail oficial da planilha e a senha inicial pelo fluxo admin do Auth). Isso preserva todos os vínculos já gravados (comissão e eventos) e evita duplicidade no seletor. Nenhum registro novo paralelo é criado.
3. **Presidente sem usuário e sem vínculo** — cria-se a conta no Auth, o perfil, o `org_members` com a comissão correta e o registro em `commission_responsibles`.
4. **Cléo tem duas contas** (`cleo@fenasoja.com.br` e `fenasojafeira@gmail.com`, esta a que realmente é usada). Mantenho as duas como estão e vinculo a comissão à conta em uso; nenhuma exclusão será feita sem sua confirmação.
5. Nenhum acesso é removido de Eduardo Santos, Rodrigo Calixto, Germano Büttow ou de qualquer outro; toda alteração é aditiva.

## Escopo de acesso concedido

Somente para as contas novas/promovidas nesta implantação:

- role `leitura` na organização;
- capabilities: `cronograma_eventos_access` + `cronograma_scoped_access` (idênticas ao padrão restrito já em uso);
- nenhum acesso a financeiro, logística, mapa comercial ou administração.

Quem já tem capabilities maiores mantém tudo intacto.

## Dados complementares

`org_members` já tem `telefone`, mas não tem campo de nascimento. Vou adicionar a coluna `data_nascimento date` (nullable) em `org_members` e gravar as datas da planilha. Telefones são normalizados para dígitos com DDI/DDD preservados quando informados na planilha; quando a planilha traz só o número local (padrão 55/RS), gravo com o DDD 55 sinalizado na revisão final.

## Detalhes técnicos

- Criação/promoção de contas via edge function administrativa dedicada (padrão `provision-fenasoja-users`), protegida por token de worker, usando `auth.admin.createUser` / `updateUserById`. A senha `Fenasoja@2028` nunca é gravada em tabela, log ou código versionado de dados.
- Migração de schema: `ALTER TABLE public.org_members ADD COLUMN data_nascimento date`.
- Dados (telefone, nascimento, `commission_responsibles`, `org_members`, `user_capabilities`) aplicados por operações de escrita de dados, sempre com match por `user_id`/`commission_id`, nunca por texto.
- Front-end: nenhuma mudança estrutural esperada. O seletor "Pessoas responsáveis" já deduplica por `user_id` em `useCronogramaRelationOptions`; apenas confirmo que cada presidente aparece uma única vez após a promoção dos placeholders.

## Validação antes de considerar concluído

- Matriz por perfil: usuário existente (login e senha intactos, módulos anteriores acessíveis), presidente novo (login com a senha padrão, vê evento pela comissão, vê evento por vínculo direto, não vê evento sem vínculo, não alcança outros módulos).
- Auditoria de eventos históricos: conferir que nenhum evento antigo ficou visível sem vínculo estruturado de comissão ou responsável.
- Consistência: nenhum e-mail duplicado, nenhum perfil duplicado, nenhum nome repetido no seletor, nenhuma comissão criada só para vincular.
- Coerência de contagem entre Timeline, Dashboard e Calendário para um presidente restrito (todos leem a mesma fonte sujeita à RLS).

## Entrega

Relatório final com a tabela Nome / Comissão / E-mail / WhatsApp / Nascimento / Situação / Senha inicial, mais os totais (presidentes identificados, criados, atualizados, vínculos, disponíveis em "Pessoas responsáveis"), o resultado dos testes e a lista de registros que não puderam ser processados com o motivo.
