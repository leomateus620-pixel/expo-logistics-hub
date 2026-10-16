# Equipe Fenasoja: aplicar as duas migrations pendentes

## O que será feito
1. Aplicar, nesta ordem e com o texto idêntico ao dos arquivos (sem reescrever nada):
   - `20261016130000_workers_confirmed_actions.sql`: ações confirmadas por cartão.
   - `20261016130100_workers_routines_memory.sql`: rotinas, memória, alertas e caixa de pendências.
2. Antes de aplicar, conferir o SHA256 de cada arquivo. Depois de aplicar, conferir se o arquivo gravado pela ferramenta de migrations é idêntico ao original.
3. Se o banco recusar alguma instrução, parar e relatar o erro exato, sem adaptar o texto.

## Verificação (somente estrutura)
- Tabelas novas existem, com RLS ligada, políticas criadas e sem ligação com a tabela de usuários.
- Permissões: usuários logados só leem; visitantes sem login não têm acesso; tabelas privadas ficam fechadas.
- As funções existem e os papéis certos podem executá-las.
- Os três serviços da Equipe continuam respondendo 401 sem login e 204 na checagem do navegador.
- Nenhum dado de negócio lido ou criado, nenhuma função reimplantada e nada publicado.

## Fora deste passo
- A checagem de prontidão `workers_schema_ready`, as rotinas no servidor e as etapas 2 a 7 terão planos próprios.
