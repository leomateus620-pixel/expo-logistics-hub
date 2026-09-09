# Trocar senhas: Fabiano Soltis e Djeison Drey

## Contas identificadas (verificadas)

Cada um tem duas contas no sistema; apenas uma de cada é a conta realmente usada para entrar:

- **Fabiano Soltis** — `soltis.fs@gmail.com` (último acesso hoje). A outra, `soltis@fenasoja.com.br`, nunca foi usada.
- **Djeison Fernando Drey** — `djeisondrey@gmail.com` (último acesso em 31/07). A outra é apenas um registro sem acesso (`placeholder-...@noaccess.local`).

## O que será feito

1. Definir a senha `Soltis!2028` para a conta de acesso do Fabiano (`soltis.fs@gmail.com`).
2. Definir a senha `Djeison!2028` para a conta de acesso do Djeison (`djeisondrey@gmail.com`).
3. Manter e-mails confirmados, para que o login funcione na hora.
4. Conferir que as duas contas continuam com os mesmos acessos e permissões de antes.

As contas duplicadas não serão alteradas. Nada será publicado em produção.

## Detalhes técnicos

- Uso da função administrativa já existente `admin-reset-password` (Admin API com service role, protegida por token de worker), sem expor segredos no chat nem no código.
- Alvos: `b8fd1e36-b46c-4eff-bb75-372b676ce123` (Fabiano) e `e0ada2e5-4440-4d15-91bd-aa4160247113` (Djeison), com `email_confirm: true`.
- Nenhuma mudança de esquema, RLS, papéis ou capacidades.
