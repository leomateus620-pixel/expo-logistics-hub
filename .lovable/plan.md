## Limpeza de localizações fantasmas

### Diagnóstico
Verifiquei a tabela `transport_locations` cruzada com `transports`. Encontrei **3 transportes pendentes** com linha-fantasma — o `driver_user_id` salvo na localização não corresponde ao motorista atualmente designado:

| Transporte | Origem → Destino | Status | Motorista atual | Driver na location (fantasma) |
|---|---|---|---|---|
| `f7833513…` | Santa Rosa → Chapecó | pendente | `40381ce4…` | `b664fc22…` |
| `4e0933b0…` | Santa Rosa → Passo Fundo | pendente | `40381ce4…` | `b664fc22…` |
| `2f77c66c…` | Santa Rosa → Santo Ângelo | pendente | `9adb622d…` | `b664fc22…` |

O transporte concluído (`91674b21…`) já tem o driver correto, então não precisa de limpeza.

Esses três registros são herança do mesmo padrão que travou a viagem anterior: quando o motorista correto for iniciar a viagem, o `update` dele falharia silenciosamente por RLS/ownership. Apesar do fallback que adicionamos em `useLocationTracking.ts` agora resolver isso em runtime, o ideal é deixar o estado limpo antes do início da viagem para evitar qualquer flicker no mapa.

### Ação proposta
Migration única que apaga apenas as localizações de transportes que ainda **não estão em andamento/em retorno** (status `pendente` ou `cancelado`), pois para esses não faz sentido manter rastreamento ativo:

```sql
DELETE FROM public.transport_locations tl
USING public.transports t
WHERE tl.transport_id = t.id
  AND t.status IN ('pendente', 'cancelado');
```

Isso remove as 3 linhas-fantasma identificadas e qualquer outra resquício do mesmo tipo, sem tocar em viagens em andamento ou concluídas.

### Garantia futura
A Edge Function `transport-lifecycle` já foi atualizada na correção anterior para apagar `transport_locations` no `handleStart` e `handleStartReturn`, então novas viagens iniciadas a partir de agora começam sempre com o estado limpo. Esta migration apenas higieniza o histórico que ficou de antes.

### Arquivos
- Nova migration em `supabase/migrations/` com o `DELETE` acima.