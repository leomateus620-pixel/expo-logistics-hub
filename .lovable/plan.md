# Reunião: corrigir `invalid_capture_contract` na abertura da sessão

## Causa raiz (confirmada por leitura de código)

A captura já foi migrada para transcrição nativa do navegador: o cliente não envia mais áudio, e sim texto. Em `CaptureSegmenter.prepare()` o `mimeType` preparado é `text/plain;charset=utf-8` (constante `AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE`), e esse valor é enviado no `payload.capture` da ação `start`.

As Edge Functions ficaram na versão antiga do contrato:

- `supabase/functions/agenda-meeting-control/index.ts` valida `capture.mimeType` contra `CAPTURE_MIME_TYPES`, que só contém tipos `audio/*`. Por isso o servidor responde `400 invalid_capture_contract` — exatamente o erro do relatório, logo após `STEP_CONTROL_START`.
- `supabase/functions/_shared/agenda-meeting/contracts.ts` tem a mesma lista `ALLOWED_MIME_TYPES` para o upload de segmento, ou seja: mesmo corrigindo só o `start`, o primeiro envio de segmento de texto falharia em seguida com `unsupported_audio_mime_type`.

O banco já está correto: a migration `20260814200918_*.sql` grava os segmentos com `mime_type = 'text/plain'`. Nenhuma alteração de banco é necessária.

## Correções

1. **`_shared/agenda-meeting/contracts.ts`** — incluir o tipo de texto (`text/plain` e `text/plain;charset=utf-8`) na lista de MIME aceitos e ajustar as validações de upload de segmento para o caminho de texto (o tamanho continua limitado, sem exigir cabeçalhos de áudio).
2. **`agenda-meeting-control/index.ts`** — aceitar o MIME de texto no contrato de captura, mantendo as demais regras (`backend`, `segmentDurationMs = 30000`, `audioPersistence`) intactas.
3. **Alinhamento cliente/servidor** — garantir que a constante usada no cliente e a lista do servidor sejam idênticas em normalização (minúsculas, sem espaços), para não voltar a divergir.
4. **Testes** — atualizar/estender os testes existentes do módulo para cobrir o contrato de texto no `start` e no envio de segmento.

## Validação

- Deploy das funções e chamada real de `start` com JWT de usuário membro em um evento persistido, esperando `ok: true` em vez de `invalid_capture_contract`.
- Sessão real curta na reunião: verificar que o timer sai de `00:00:00`, que a transcrição ao vivo aparece e que ao menos um segmento de texto é persistido, seguido de `finalize`.
- Nenhum áudio é persistido em nenhum ponto — apenas texto.
