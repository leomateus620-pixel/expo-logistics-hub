# Corrigir o login do Will e a exibição em CAIXA ALTA nos campos

## O que foi verificado

- A conta `will@filmesdowill.com` existe, está confirmada e já entrou no sistema com sucesso em 31/08 às 10:59. Não está bloqueada.
- Os registros de autenticação mostram várias tentativas hoje com "credenciais inválidas" — ou seja, a senha enviada não confere.
- O sistema tem uma regra visual global que força TODOS os campos de digitação a aparecerem em letras maiúsculas, inclusive **e-mail e senha**. O texto digitado não é alterado de fato: apenas a exibição muda.
- Consequência: ao digitar a senha, o usuário vê `FENASOJA@2028` mesmo que tenha digitado `fenasoja@2028`. Como a senha diferencia maiúsculas de minúsculas, ele não tem como perceber o erro. Esta é a causa mais provável das falhas de login relatadas.

## O que será feito

1. **Campos de e-mail e senha deixam de ser exibidos em caixa alta** em todo o sistema (tela de login e qualquer outro formulário com senha/e-mail). O usuário passa a ver exatamente o que digitou, com maiúsculas e minúsculas reais. Os demais campos do sistema continuam em caixa alta como hoje.
2. **Teclado de celular ajustado** nesses campos: sem autocapitalização, sem autocorreção e sem verificação ortográfica, para evitar que o celular coloque a primeira letra em maiúscula automaticamente.
3. **Reinicializar a senha do Will** para `Fenasoja@2028`, mantendo a mesma conta, os mesmos vínculos e permissões, para garantir acesso imediato.
4. Validação: teste real de login com `will@filmesdowill.com` / `Fenasoja@2028` e conferência visual de que a senha digitada aparece com a caixa correta.

## Detalhes técnicos

- Em `src/index.css`, a regra `input, textarea, select, [role="combobox"] { text-transform: uppercase }` passa a excluir `input[type="password"]` e `input[type="email"]` (e o campo de e-mail do login, caso use `type="text"`).
- Em `src/pages/LoginPage.tsx`, os inputs de e-mail e senha recebem `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}` e `style={{ textTransform: 'none' }}` como reforço.
- A senha é redefinida pela API administrativa de autenticação (`auth.admin.updateUserById`) via a função administrativa já existente, sem tocar em SQL do schema `auth`.
