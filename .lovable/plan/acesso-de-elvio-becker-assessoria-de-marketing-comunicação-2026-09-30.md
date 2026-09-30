# Acesso de Elvio Becker — Assessoria de Marketing/Comunicação

## Situação confirmada
- Não existe nenhum cadastro de "Elvio", "Élvio" ou "Becker" no sistema: não aparece em contas, equipe, responsáveis das comissões, presidentes nem responsáveis de eventos. Também não há conta com elviobecker@gmail.com.
- A Assessoria de Marketing/Comunicação existe e já tem dois vínculos: Zélia Savoldi (principal) e Jonas (equipe de apoio, com acesso restrito à agenda).

## O que será feito
1. Criar a conta **elviobecker@gmail.com** já confirmada, com a senha informada (definida pelo fluxo administrativo seguro, sem registrar a senha em código, banco ou logs). Nome exibido: **Elvio Becker**.
2. Vincular Elvio à **Assessoria de Marketing/Comunicação** como integrante da equipe (mesmo tipo de vínculo do Jonas). Assim ele aparece em "Pessoas responsáveis" e o menu da assessoria abre para ele.
3. Perfil restrito (sem papel de administrador ou gestor):
   - Agenda Fenasoja: vê somente eventos da Assessoria de Marketing ou em que ele for responsável (mesma regra já usada pelos presidentes restritos).
   - Mapa Comercial: somente visualização; sem menu Vendas, Dashboard, edição de preços ou Financeiro.
   - Sem Logística, Financeiro ou Administração.
4. Não alterar Zélia, Jonas nem qualquer outro usuário.

## Validação
- Confirmar que não ficou conta ou vínculo duplicado.
- Entrar com a conta do Elvio no navegador e conferir: menu da assessoria, agenda só com eventos relacionados, mapa aberto sem Vendas.
- Não publicar.

## Detalhes técnicos
- Conta criada via função administrativa (padrão `provision-fenasoja-users`).
- `org_members`: role `leitura`, cargo "Assessoria de Marketing/Comunicação".
- `commission_responsibles`: commission `ed23de8f-…` (assessoria-de-marketing), `relationship_role = equipe_apoio`, ativo.
- `user_capabilities`: `cronograma_eventos_access`, `cronograma_scoped_access`, `map.view`.
