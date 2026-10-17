# BOT FENASOJA: aplicar as quatro migrations da PR #206

## Estado conferido (leitura)
- Checkout inclui PR #206 (9132f08b) e #207 (1259173f).
- Os quatro arquivos existem; nenhum consta no histórico (últimas aplicadas: 0010 e 0011).
- Dependências presentes: `ai_workers_can_access(uuid)` e schema `workers_private`.
- Volume baixo: 14 mensagens, então o bloqueio da primeira migration é curto.

## Execução
1. Antes de cada arquivo: conferir SHA256 e procurar objetos já criados sem registro (`message_seq`, sequência, funções `workers_map_sales_overview`, `workers_agenda_personal_summary`, `workers_agenda_people_ranking`, `workers_map_inventory_summary`, `workers_agenda_query`, `ai_workers_read_history`, sanitizadores). Se achar algum, parar e relatar.
2. Aplicar um arquivo por vez, nesta ordem e com o texto idêntico, pela ferramenta oficial:
   - 20261017010000_workers_message_order.sql (a678f0b9…)
   - 20261017020000_workers_verified_analytics.sql (f99c8dfb…)
   - 20261017030000_workers_response_persistence.sql (e9db14cd…)
   - 20261017040000_workers_question_analytics.sql (a319035a…)
3. Depois de cada uma, conferir se o arquivo gravado é idêntico. Se a plataforma recusar uma instrução, parar a sequência e relatar o erro exato, sem adaptar o texto. Arquivos seguintes ficam pendentes.
4. Backup: o banco tem cópia diária automática (cerca de 14 dias). Recomendo exportar antes em Mais → Banco → Gerenciar → Configurações. Eu não consigo ver a lista de backups.

## Validação (somente leitura)
- Quatro novas versões no histórico.
- Sequência e coluna `message_seq` existem; as 14 mensagens continuam lá, todas com sequência.
- Funções existem com SECURITY INVOKER e as permissões do arquivo; os sanitizadores privados ficam fechados para o app.
- `ai_workers_finish_turn` foi atualizada; RLS e políticas não mudaram.
- Teste com sessão (se houver): ler o próprio histórico por turnos, pergunta antes da resposta. Organização diferente e acesso negado ficam pendentes se não houver contas de teste.
- Nenhum dado criado, nenhuma ação comercial.

## Entrega
Tabela arquivo | versão | situação | evidência, além das falhas e pendências.
Conferir se o `workers-orchestrator` publicado corresponde ao commit. Reimplantar só com pedido explícito. Frontend não publicado. Não declarar o bot homologado.
