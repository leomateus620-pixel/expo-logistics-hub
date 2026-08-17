# Acesso ao sistema sem redirecionamento automático para Logística

## O que está acontecendo

Verificação feita no código de rotas e de login:

1. Em `src/App.tsx`, a rota raiz (`/`) para usuário autenticado com acesso completo renderiza diretamente o `Dashboard` da Logística dentro do layout logístico. Ou seja, qualquer admin/gestor/operador que abre `fenasojagestao.com` cai no Painel Operacional da Logística.
2. Em `src/pages/LoginPage.tsx`, a função que decide o destino após o login tem como fallback final `/comissoes/logistica/dashboard`. Quem entra por um login sem módulo definido também é enviado para a Logística.

## Correção proposta

1. Rota raiz: usuário autenticado passa a ver o **Portal de módulos** (`CommissionPortalPage`), o mesmo que já é exibido para visitantes, agora no estado autenticado — cada pessoa escolhe o ambiente (Agenda FENASOJA, Restaurante e Arena, Logística, Financeiro, Mapa Comercial, Admin) conforme suas permissões.
2. Login: o destino padrão passa a ser `/portal` em vez do dashboard da Logística. Os destinos específicos continuam iguais (login de admin → `/admin`, cronograma → `/cronograma-eventos`, restaurante/arena, mapa comercial, e o `returnTo` quando o usuário tentou abrir uma página protegida).
3. Usuários restritos continuam com o comportamento atual de atalho direto (por exemplo, quem só tem mapa comercial segue indo direto ao mapa; mobilidade segue para `/mobility-auth`), porque para eles o portal não oferece escolha.
4. A Logística continua acessível normalmente pelo portal e pelas rotas `/comissoes/logistica/*` e legadas — nada é removido.

## Detalhes técnicos

- `src/App.tsx` → `RootRoute`: substituir o bloco que renderiza `AuthenticatedLogisticsLayout + Dashboard` por `CommissionPortalPage` (dentro de `Suspended`), mantendo os desvios já existentes para `map.view` e portais de mapa de comissão.
- `src/pages/LoginPage.tsx` → `resolveTarget()`: trocar o retorno final `'/comissoes/logistica/dashboard'` por `'/portal'`.
- Sem mudanças de banco, RLS ou permissões.

## Validação

- Entrar com o usuário admin (Leonardo) em `/` e confirmar que aparece o portal de módulos, não o Painel Operacional.
- Login por `/login/logistica` continua indo para o dashboard da Logística.
- Usuário só de mapa (Eduardo) continua indo direto ao mapa comercial.
- Usuário escopado (Bruna/Germano) continua com acesso apenas aos seus módulos.
