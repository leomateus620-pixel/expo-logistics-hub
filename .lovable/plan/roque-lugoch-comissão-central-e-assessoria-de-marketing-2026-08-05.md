# Roque Lugoch, Comissão Central e Assessoria de Marketing

Três entregas: criar/ajustar o acesso do Roque Vanderlei Lugoch, oficializar a Comissão Central com seus integrantes, e disponibilizar a Assessoria de Marketing (vinculada à Zélia) no campo "Comissão ou Assessoria responsável".

## 1. Usuário Roque Vanderlei Lugoch

- Criar o login `rvlugoch@gmail.com` com a senha informada (e-mail já confirmado). Se esse e-mail já existir, apenas redefinir a senha.
- Hoje existe um cadastro "ROQUE VANDERLEI LUGOCH" (perfil somente leitura, importado da lista de voluntários). O acesso passa a ser o novo login: nome de exibição padronizado para "Roque Vanderlei Lugoch", cargo mantido, perfil operacional, marcado como equipe 2028 para aparecer em "Membros do sistema". O registro antigo de voluntário é desativado para não duplicar a pessoa nas listas.
- Liberar todos os menus do sistema (logística, cronograma e eventos, eventos restaurante e arena, mobilidade, mapa comercial, portais Exporural e Indústria/Comércio/Serviços e demais comissões), exceto o Financeiro Gerencial.

## 2. Financeiro continua restrito

Hoje quem tem acesso total (ou perfil gestor) enxerga também o módulo Financeiro Gerencial. Para o Lugoch ficar com tudo menos o financeiro, o módulo sensível passa a exigir permissão financeira explícita ou perfil administrador — acesso total genérico deixa de abrir o financeiro. Administradores atuais (Fabiano Soltis, Djeison, etc.) continuam com acesso.

## 3. Comissão Central

- Já existe uma unidade "CENTRAL" marcada como histórica (aparece no fim das listas e fora das opções de cadastro). Ela será oficializada como "Comissão Central", em primeiro lugar na ordenação, passando a aparecer no seletor "Comissão ou Assessoria responsável" do Cronograma e Eventos e nos demais módulos que usam o registro organizacional.
- Vincular como responsáveis (ligados aos usuários reais quando existem): Roque Vanderlei Lugoch (principal), Fabiano Soltis, Djeison Drey, Débora Letícia Bamberg, Cléo Antonio Rockenbach, Fernanda Secklereich e Marcos Eduardo Servat.

## 4. Assessoria de Marketing

- Criar a unidade oficial "Assessoria de Marketing" no registro organizacional, disponível no seletor "Comissão ou Assessoria responsável".
- Vincular a Zélia Savoldi como responsável principal, com o vínculo ao usuário dela (assim ela deixa de aparecer só em "Selecionar responsáveis" e passa a ter unidade própria).

## Detalhes técnicos

- Criação do login via função administrativa existente (`create-user`), sem alterar a `auth` diretamente.
- Dados: `UPDATE` em `commissions` (CENTRAL → oficial, ordem 0) e `INSERT` da Assessoria de Marketing; `INSERT` em `commission_responsibles` com `user_id` resolvido por nome, `is_primary` no responsável principal; `UPDATE`/`INSERT` em `org_members` (nome, `role`, `is_core_team`, desativação do registro duplicado); `INSERT` em `user_capabilities` com todas as capabilities de módulo exceto `financial_access`.
- Código: ajuste em `src/hooks/useModuleAccess.ts` para o módulo sensível exigir `financial_access`, `admin_access` ou papel `admin` (não mais `full_access`/`gestor`), com atualização dos testes que cobrem essa regra.

## Validação

- Login com o novo usuário: sidebar e portais completos, Financeiro Gerencial bloqueado.
- Novo evento no Cronograma: "Comissão Central" e "Assessoria de Marketing" aparecem no seletor de comissão/assessoria, com os responsáveis corretos no resumo.
