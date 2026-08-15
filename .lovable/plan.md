# Acesso de Eduardo Kretschmer — Mapa Comercial completo

## O que será criado

Conta `eduardokretschmer7@gmail.com` com senha `Fenasoja@2028`, já confirmada (entra direto, sem e-mail de verificação).

Nome de exibição: **Eduardo Kretschmer**. Cargo: **Gestão do Mapa Comercial**.

## Acesso liberado

- **Mapa Comercial completo** — Exporural e Indústria, Comércio e Serviços, com gestão total: editar lotes, geometrias, camadas, preços, reservas, vendas e contratos.
- Ao entrar, ele cai direto no Mapa Comercial (é o único módulo dele).

## Acesso bloqueado (RLS restrito)

- Agenda FENASOJA (cronograma e eventos)
- Agenda Restaurante e Arena
- Financeiro Gerencial e reembolsos
- Logística, frota, transportes, carrinhos e patinetes
- Área administrativa e gestão de usuários

Ele não recebe papel de admin nem gestor na organização — o papel dele é de leitura, e todo o poder no mapa vem exclusivamente das permissões do mapa. Assim, nenhum outro menu é aberto por herança de papel.

## Validação

Após criar, confirmo que a conta:
1. autentica com a senha definida;
2. abre o Mapa Comercial com os dois segmentos visíveis e ferramentas de edição ativas;
3. não lista eventos da Agenda, nem dados financeiros ou de frota.

## Detalhes técnicos

- Usuário criado via Admin Auth API (`email_confirm: true`), `profiles.full_name` atualizado e `user_roles` com `user`.
- `org_members`: org `985888b8-155f-4bbe-b6b9-6bef2893d99b`, `role = 'leitura'`, `is_active = true`.
- `user_capabilities` (org acima): `map.view`, `map.edit`, `map.edit_geometry`, `map.manage_lots`, `map.manage_sales`, `map.manage_contracts`, `map.manage_layers`, `map.admin`.
- Nenhuma capability de `cronograma_*`, `venue_*`, `financial_access`, `logistica_access`, `mobility_access`, `admin_access` ou `full_access`.
- Roteamento: `App.tsx` já redireciona usuários sem `hasFullAccess` que possuem `map.view` para o mapa; `resolveMapPermissions` concede gestão completa via `map.admin`.
- RLS: `map_has_explicit_capability` reconhece `map.admin` para escrita nas tabelas de mapa; demais módulos permanecem fechados por ausência de capability.
