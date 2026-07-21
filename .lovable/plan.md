## Problema
1. **Redirecionamento indevido após OAuth:** o `returnUrl` está hardcoded como `${window.location.origin}/settings?google=connected`. Quando o Google devolve o popup, se o navegador reaproveita a aba principal (ou o usuário fecha o popup e volta ao app), acaba caindo em `/settings`, que dentro do contexto de comissão vira "Configurações da Comissão LOGÍSTICA".
2. **Widget em "Conexão não finalizada":** o registro em `google_calendar_connections` está com `status='connecting'` (nunca avançou para `connected`). O consent no Google foi concluído, mas o `complete` (probe + criação de calendário + upsert) não rodou com sucesso — provavelmente porque o popup foi fechado antes do `await` resolver, ou a propagação do gateway demorou além das 3 tentativas.

## Correções

### 1. `useGoogleCalendarConnection.ts`
- Trocar `returnUrl` para a **rota atual do usuário** em vez de `/settings`:
  ```ts
  const returnUrl = `${window.location.origin}${window.location.pathname}?google=connected`;
  ```
  Assim o popup (ou fallback de aba) volta para `/cronograma-eventos` (ou qualquer página onde o widget viva), nunca para `/settings`.
- Aumentar a robustez do `complete`: subir tentativas de 3 → 6 com backoff 2s, e chamar `complete` **também** quando a página recarrega com `?google=connected` no query string (efeito colateral: recupera fluxos onde o popup foi fechado cedo).

### 2. `google-calendar-oauth` (edge function)
- Adicionar tolerância no `complete`: se o probe falhar mas já existir registro `connecting` recente (<10min), retornar `202 pending` em vez de marcar `error`, para o frontend continuar tentando sem travar a UI.
- Nada muda no `start`/`reset`/`disconnect`.

### 3. Destravamento imediato do registro atual
- Rodar server-side: probar a conexão do usuário `b664fc22-…` via gateway; se OK, criar calendário secundário, popular `google_email`, marcar `status='connected'` e enfileirar backfill. Se probe falhar, apagar o registro travado para permitir reconexão limpa.

### 4. Consumir `?google=connected` no dashboard/cronograma
- Adicionar um `useEffect` no componente que monta o `GoogleCalendarHeroWidget` (ou no próprio widget) que, ao detectar `?google=connected` na URL, dispara `complete` uma vez e limpa o query param via `history.replaceState`. Assim o fluxo se fecha mesmo quando o usuário fecha o popup antes do await.

## Fora de escopo
- Não mexer no fluxo de login/AuthGuard — o redirecionamento reportado é 100% consequência do `returnUrl` errado do OAuth do Google, não do login geral do app.
