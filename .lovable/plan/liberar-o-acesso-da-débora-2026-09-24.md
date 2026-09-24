# Liberar o acesso da Débora

## O que foi verificado
- A conta `debora@fenasoja.com.br` existe, está com o e-mail confirmado, não está bloqueada e tem vínculo ativo com a Fenasoja.
- Ela **nunca conseguiu entrar**: não há nenhum acesso registrado. A senha salva na conta não é a que foi enviada a ela por mensagem, e por isso aparece "E-mail ou senha incorretos".

## O que será feito
1. Definir a senha enviada a ela para a conta `debora@fenasoja.com.br`, de forma segura (sem gravar a senha no código nem repeti-la no chat).
2. Manter o e-mail confirmado e todos os acessos e permissões atuais sem alteração.
3. Testar o login com essas credenciais na tela da Agenda e confirmar que ela entra no sistema.

Nada será publicado. Nenhum outro usuário será alterado.

## Detalhes técnicos
- Alvo: usuário `d251d7d6-389f-42f3-afef-8b94db02a47b`.
- Mesmo fluxo já usado para o Eduardo: secret temporário → função `create-user` com `action: update_password` e `email_confirm: true`, chamada com sessão de administrador → remover o secret.
- Validação com `signInWithPassword` via Playwright; sem mudança de esquema, RLS ou papéis.
