## Problema

Sua linha em `google_calendar_connections` ficou travada com `status='connecting'` (desde 06:04 UTC, sem `google_email` e sem `last_error`). O widget desabilita o botão sempre que `status === 'connecting'`, então não há como reiniciar o fluxo pela UI — mesmo que o popup do Google já tenha sido fechado.

Causa: quando o `complete` falha (ex.: `no_connection` após as 3 tentativas), o registro permanece em `connecting` para sempre, e o front bloqueia novo clique.

## Correção

1. **UI (`GoogleCalendarHeroWidget.tsx`)**
   - Só desabilitar o botão enquanto `connect.isPending` (mutação em execução), não quando o `status` do banco for `connecting`.
   - Quando `status='connecting'` mas nenhuma mutação está rodando, mudar o rótulo para **"Tentar novamente"** e mostrar um sublinha discreta ("Conexão anterior não finalizada").

2. **Hook (`useGoogleCalendarConnection.ts`)**
   - Antes de abrir o popup no `connect.mutate`, chamar uma nova ação `reset` no edge function para limpar registros travados desse usuário (`status in ('connecting','error')` sem `google_email`).
   - Manter o retry loop atual do `complete`.

3. **Edge function (`google-calendar-oauth/index.ts`)**
   - Adicionar branch `action === 'reset'`: deleta (ou marca como `disconnected`) a linha do usuário atual quando `status <> 'connected'`. Retorna `{ ok: true }`.
   - Garantir que, ao falhar `complete` após retries, a linha vá para `status='error'` com `last_error` preenchido (em vez de continuar `connecting`), para o próximo refetch já refletir estado recuperável.

4. **Limpeza pontual do seu registro atual**
   - Executar `delete from google_calendar_connections where user_id='b664fc22-…' and status='connecting';` para destravar imediatamente sua sessão.

5. **Verificação**
   - Recarregar o dashboard → widget deve voltar para "Conectar".
   - Clicar em conectar → popup OAuth → após aprovar, toast de sucesso e `status='connected'` no banco.

Sem mudanças de escopo/negócio; só destrava o fluxo e adiciona recuperação automática de estado inconsistente.
