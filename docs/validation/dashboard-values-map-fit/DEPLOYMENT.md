# Ordem de liberação

A versão nova do cliente depende do vínculo de preços na view existente. A PR permanece em rascunho enquanto o banco publicado não passar o gate de schema. O mapa atual em `main` continua usando sua consulta anterior.

1. Aplicar somente `supabase/migrations/20261001193000_commercial_dashboard_financial_embed.sql` no projeto existente pelo Lovable/Supabase, conforme combinado com o usuário. A migration conserva todas as colunas anteriores, fórmulas, overrides, permissões invoker e acrescenta `entity_id` ao final. Não altera lotes, vendas, pedidos ou parcelas.
2. Conferir o sucesso do SQL e da atualização de cache (`NOTIFY pgrst, 'reload schema'`).
3. Executar, na raiz do repositório:

   ```powershell
   node scripts/dashboard/remote-pricing-gate.cjs docs/validation/dashboard-values-map-fit/published-gate.json
   ```

   O comando usa a configuração pública já existente, faz duas verificações de schema com `limit=0` e não lê registros nem valores. Reutiliza literalmente o select do serviço. Ambos os probes devem retornar HTTP 200 com array vazio e `ready: true`.

4. Após esse gate, revisar os checks e liberar/mergear o cliente. A abertura da dashboard, o refetch e a confirmação/cancelamento das vendas devem ser conferidos em uma sessão autorizada do projeto publicado. As capturas locais não comprovam valores de produção.

Se a implantação da migration já tiver sido feita fora do Git, registrar o identificador conforme o fluxo de migrations do projeto para evitar reaplicação indiscriminada de migrations antigas.

Não foram criadas regras de preços ou políticas. A prova PostgreSQL/PostgREST local verifica o embed real, empates e RLS no banco isolado de teste; a checagem pública de schema não comprova os valores ou todas as permissões de uma sessão autenticada em produção.
