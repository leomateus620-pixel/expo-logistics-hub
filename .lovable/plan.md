# Corrigir o acesso do Eduardo (sem administrador)

## Situação atual (verificada)
- Eduardo (`eduardo.s.qt@gmail.com`) está com o **papel de administrador em dois lugares**: no papel geral do sistema e na organização Fenasoja. Ele não tem nenhuma permissão específica.
- Com isso ele vê tudo hoje: Dashboard e Vendas do mapa, Financeiro, todas as comissões e a agenda inteira.
- Para cadastrar e editar na Logística (transportes, convidados etc.), as regras atuais exigem o papel "operador" ou superior. Mas no aplicativo o papel "operador" também libera acesso total. Por isso não basta trocar o papel dele.

## Acesso final do Eduardo
- **Comissão de Logística:** pode cadastrar e editar (ciclo 2028 como padrão e 2026 nas Configurações, como já está).
- **Mapa Comercial:** só visualização, sem Dashboard, Vendas, preços internos ou edição.
- **Financeiro:** sem acesso.
- **Agenda Fenasoja:** vê só os eventos da comissão dele ou aqueles em que ele está vinculado.
- **Demais comissões e área administrativa:** sem acesso.

## O que será feito
1. Remover o papel de administrador geral do Eduardo e mudar o papel dele na organização de "admin" para "operador", mantendo o cargo de Presidente e o vínculo com a comissão de Logística.
2. Dar a ele as permissões certas: acesso à Logística, visualização do mapa, agenda da própria comissão e uma marca de "acesso restrito".
3. No aplicativo, fazer a marca de acesso restrito impedir que o papel "operador" libere acesso total. Assim ele fica limitado às permissões acima. Os outros operadores continuam como estão.
4. Garantir que a agenda e o mapa respeitem esse limite. Na agenda, ele vê só a comissão dele e os eventos vinculados a ele. No mapa, ficam escondidos o Dashboard, as Vendas e a edição.
5. Testar entrando como Eduardo:
   - a Logística abre e permite salvar;
   - o Financeiro e as outras comissões ficam bloqueados;
   - o mapa não mostra Dashboard nem Vendas;
   - a agenda só mostra eventos dele ou da comissão.

Nada será publicado. A senha dele e os dados da Logística não serão alterados.

## Detalhes técnicos
- Dados (run_sql) do usuário `87d4fa05-375e-4e8f-9b56-d1b0c5d442b2`:
  - remover `user_roles.role='admin'` e manter `user`;
  - `org_members.role='operador'`;
  - inserir em `user_capabilities` estes itens: `logistica_access`, `map.view`, `cronograma_eventos_access`, `cronograma_scoped_access` e `restricted_scope`.
- `CapabilitiesProvider`: `hasFullAccessByRole` passa a ser false quando `restricted_scope` está presente. Nesse caso as capabilities também passam a ser carregadas para operadores.
- `hasCapability('venue_*')` e `resolveMapPermissions`: com `restricted_scope`, o papel operador não eleva permissões. Revisar também `resolveModuleAccess` e o escopo da agenda (`has_scoped_cronograma_access` e hooks do cronograma), para que o operador restrito siga o escopo da comissão.
- Limitação no servidor: as regras atuais das tabelas ainda autorizam "operador" em alguns módulos fora da Logística. A interface vai bloquear esse acesso. Se você quiser bloqueio também no servidor, isso fica como etapa separada.
- Adicionar testes unitários para `restricted_scope` em `CapabilitiesProvider`/`resolveModuleAccess`/`resolveMapPermissions` e rodar `tsgo`.
