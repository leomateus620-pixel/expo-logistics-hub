## Redefinir senha dos três usuários

Atualizar a senha dos usuários abaixo para `Fenasoja@2028` via Admin API do backend (auth.users):

- soltis.fs@gmail.com
- djeisondrey@gmail.com
- zelia.savoldi@hotmail.com

### Passos
1. Localizar o `user_id` de cada e-mail em `auth.users`.
2. Executar `admin.updateUserById(user_id, { password: 'Fenasoja@2028' })` para os três (via script one-shot com service role no ambiente do backend).
3. Confirmar sucesso e comunicar as novas credenciais.

### Observações
- Nenhuma mudança de código/UI.
- Senha atende à política (>=8 chars, maiúscula, minúscula, número, símbolo). HIBP Check pode rejeitar se estiver em vazamento — nesse caso, informarei e sugerirei alternativa.