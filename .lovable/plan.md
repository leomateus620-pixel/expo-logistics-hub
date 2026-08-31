# Corrigir o e-mail de login do Jonas (Fotógrafo)

Hoje a conta do Jonas está cadastrada como `jmmirsan@gmail.com.br`. O endereço correto é `jmmirsan@gmail.com`.

## O que foi verificado

- Existe uma única conta com esse e-mail: `jmmirsan@gmail.com.br`, já confirmada, criada em 17/08/2026.
- Não existe nenhuma outra conta com `jmmirsan@gmail.com` — não haverá conflito nem duplicidade.
- O e-mail não é armazenado em nenhuma tabela de perfil/membro do sistema (perfil, vínculo com a assessoria, permissões e histórico usam o identificador interno do usuário). Portanto, corrigir o e-mail não afeta nada do que já está configurado.

## O que será feito

- Corrigir o endereço de login para **jmmirsan@gmail.com**, mantendo a mesma conta (mesmo ID), a mesma senha, o mesmo nome "Jonas (Fotógrafo)", a mesma foto, o vínculo com a **Assessoria de Marketing/Comunicação** como FOTÓGRAFO, as permissões da Agenda Fenasoja e todo o histórico.
- Manter o e-mail como confirmado, para que ele consiga entrar imediatamente com o novo endereço e a senha atual.

## Detalhes técnicos

- A alteração é feita pela API administrativa de autenticação (`auth.admin.updateUserById` com `email` novo e `email_confirm: true`), nunca por SQL direto no schema `auth`.
- Será adicionada uma ação `update_email` à função administrativa já existente `create-user`, protegida pela mesma verificação de administrador/gestor já usada lá. Nenhuma senha é enviada, registrada ou alterada nessa operação.
- Após a execução, confirmação por consulta: uma única conta com o e-mail novo, mesmo ID, e vínculos/capacidades intactos.

## Validação

- Conferir que `jmmirsan@gmail.com` existe, está confirmado e possui o mesmo ID de antes.
- Conferir que o vínculo com a assessoria e a permissão de acesso à Agenda Fenasoja continuam ativos.
- Login real com o novo e-mail e a senha atual.
