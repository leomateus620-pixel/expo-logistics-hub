# Corrigir a criação de eventos na Agenda Fenasoja

## Causa encontrada (confirmada no banco)
A otimização de velocidade de ontem trocou a regra de "quem pode ver um evento" por uma lista de eventos visíveis calculada uma única vez no início de cada operação. Ao criar um evento, o banco grava a linha e logo em seguida a relê para devolvê-la à tela. Essa lista, calculada antes da gravação, ainda não contém o evento novo. Por isso o banco recusa a releitura e desfaz a criação, para qualquer perfil, inclusive administradores. O código de erro que volta não está no catálogo de mensagens da Agenda, então a tela mostra a mensagem genérica "Não foi possível confirmar o salvamento".

- A edição de eventos existentes não é afetada, porque o evento já está na lista.
- Subeventos e vínculos de comissões e responsáveis são gravados depois, em etapas separadas, e já enxergam o evento.
- O último evento criado com sucesso é de 07/10 às 13:14, antes de a mudança entrar em vigor.

## Correção
1. Ajustar só a regra de leitura dos eventos da Agenda. A lista otimizada continua, e passa a valer também uma condição simples e rápida: quem criou o evento pode vê-lo (`created_by_user_id = auth.uid()`). Isso basta para a releitura da linha recém-criada, e quem vê o quê não muda, porque o criador já podia ver o próprio evento pelas regras de escopo.
2. Antes de aplicar, conferir que a gravação sempre registra o usuário logado como criador. Se não registrar em algum caminho, como a Agenda da unidade, ajustar a condição para o mesmo dado que a gravação usa.
3. Mostrar uma mensagem clara quando o banco negar acesso, em vez da mensagem genérica, e guardar o código técnico na referência do erro.
4. Revisar as outras regras de leitura que usam listas otimizadas em gravações com releitura: subeventos e a função de salvar subevento. Aplicar o mesmo ajuste se o problema se repetir.
5. Atualizar a regra técnica do projeto: listas calculadas uma vez não enxergam linhas criadas na mesma operação, então toda regra de leitura de uma tabela que recebe inserção com releitura precisa de uma condição sobre a própria linha.

## Validação
- Simular a criação de um evento como administrador e como membro de comissão, dentro de uma operação desfeita ao final, para que nenhum evento real seja criado.
- Confirmar que a edição, a exclusão e a leitura continuam iguais, com o mesmo tempo de resposta.
- Rodar os testes da Agenda.
- Não publicar sem seu pedido. A correção fica no banco, que é compartilhado, então vale também para o site publicado logo que for aplicada. A mudança na mensagem de erro só aparece no site depois de publicar.

## Detalhes técnicos
- Política afetada: `cronograma_eventos_select` (`id IN (SELECT cronograma_visible_event_ids())`). `cronograma_save_event` é SECURITY INVOKER e faz `INSERT ... RETURNING * INTO v_row`. O RETURNING aplica a política de SELECT à linha nova, mas a função STABLE usa um snapshot anterior à inserção, o que gera um erro 42501 sem o prefixo CRONOGRAMA_ e cai em CRONOGRAMA_UNKNOWN.
- A correção é uma migração com DROP/CREATE de `cronograma_eventos_select`: `USING (created_by_user_id = auth.uid() OR id IN (SELECT public.cronograma_visible_event_ids()))`. Não muda GRANTs nem as políticas de escrita.
- O rollback fica junto ao arquivo `docs/performance/rollback_rls_set_based_2026-10-07.sql`.
- `normalize()` em `src/lib/cronograma-rpc.ts` passa a mapear 42501 / "row-level security" para CRONOGRAMA_PERMISSION_DENIED.
