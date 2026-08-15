# Acesso de Bruna Pacheco de Quadros — Acolhimento e Bem Comum

## Situação confirmada
- A comissão **Acolhimento e Bem Comum** existe na organização FENASOJA e tem **Bruna Pacheco de Quadros** cadastrada como responsável principal, porém **sem usuário do sistema vinculado** (campo de usuário vazio).
- Já existe um modelo pronto de "acesso restrito por vínculo": Germano Büttow usa a permissão `cronograma_scoped_access`, que só exibe eventos em que a pessoa é responsável ou em que a comissão dela está vinculada.
- O e-mail `bruna.psicoquadros@gmail.com` ainda não possui conta.

## O que será feito

1. **Criar a conta** `bruna.psicoquadros@gmail.com` com a senha `Fenasoja@2028`, já confirmada (login imediato, sem e-mail de verificação).
2. **Vincular à organização** como membro com papel de leitura, nome de exibição "Bruna Pacheco de Quadros", cargo "Presidente — Acolhimento e Bem Comum" e comissão Acolhimento e Bem Comum.
3. **Ligar a ficha existente** da comissão (responsável "Bruna Pacheco de Quadros") ao novo usuário, para que os eventos da comissão sejam reconhecidos como dela.
4. **Liberar apenas a Agenda FENASOJA** com visão restrita: permissões `cronograma_eventos_access` + `cronograma_scoped_access`. Sem financeiro, sem mapa comercial, sem Restaurante e Arena, sem frota.
5. **Validar** que, ao entrar, ela vê somente eventos vinculados a ela ou à comissão Acolhimento e Bem Comum, e que os demais eventos permanecem invisíveis.

## Observação
Conforme pedido, o acesso será **somente de visualização** (sem criar ou editar eventos). Se quiser que ela também possa cadastrar eventos, é só avisar que incluo a permissão de escrita.

## Detalhes técnicos
- Usuário criado via Admin Auth API (e-mail confirmado, senha definida).
- Registro em `org_members` (org `985888b8…`, `role = 'leitura'`, `commission_id = 156275a6…`).
- `commission_responsibles.user_id` atualizado no registro `3e74a236…`.
- Linhas em `user_capabilities`: `cronograma_eventos_access` e `cronograma_scoped_access`.
- A filtragem já é aplicada pelas funções `has_scoped_cronograma_access` e `cronograma_scoped_event_visible` — nenhuma alteração de esquema é necessária.
