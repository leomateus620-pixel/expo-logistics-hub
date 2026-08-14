# Reuniões nativas no navegador — sem OpenAI e sem Deepgram

Objetivo: gravar → transcrever → salvar o texto funcionando 100% com recursos nativos do navegador, sem nenhuma credencial de terceiros. Nada de rotas novas, nenhuma mudança em autenticação, Agenda Fenasoja ou demais módulos.

## O que muda para o usuário

- Ao expandir um evento e iniciar a reunião, o navegador pede o microfone e a transcrição aparece ao vivo (texto parcial em cinza, texto confirmado em destaque).
- Pausar, retomar e encerrar continuam funcionando; ao encerrar, o texto consolidado é salvo no banco e vira a ata base da reunião.
- Se o navegador não tiver reconhecimento de voz nativo (ex.: Firefox), aparece um aviso claro recomendando Chrome/Edge — sem erro de API e sem pedir chave nenhuma.
- Nenhuma mensagem do tipo "falta credencial" permanece no fluxo.

## Arquitetura

```text
Evento expandido → Iniciar reunião
  → getUserMedia + MediaRecorder (áudio só em memória, descartado ao fim)
  → NativeMeetingTranscriptionAdapter (SpeechRecognition / webkitSpeechRecognition)
  → finalSegments[] + interimTranscript → canonicalTranscript
  → Edge Function recebe TEXTO (JSON) e valida
  → Supabase: recibos, segmentos e versão final da transcrição
  → Reunião concluída
```

## Frontend

- Novo `NativeMeetingTranscriptionAdapter` em `src/features/agenda-meeting-intelligence/capture/`:
  - detecção em runtime de `window.SpeechRecognition || window.webkitSpeechRecognition`, `continuous`, `interimResults`, `lang = pt-BR`;
  - tratamento de `onresult` (finais vs. intermediários), `onend`, `onerror` com mapeamento de `no-speech`, `audio-capture`, `not-allowed`, `service-not-allowed`, `network`, `aborted`;
  - reinício automático com backoff e teto de tentativas enquanto a sessão estiver ativa (sem loop infinito); parada definitiva em `not-allowed`/`service-not-allowed` com mensagem de permissão.
- Consolidação incremental: `finalSegments[]` (nunca sobrescrito), `interimTranscript` só para feedback visual, `canonicalTranscript` derivado dos finais com deduplicação de sobreposição, normalização de espaços e pontuação.
- `MediaRecorder` mantido apenas como fonte de sessão/indicador de nível e recuperação temporária; os blobs não são enviados a lugar nenhum nem persistidos.
- `useAgendaMeetingCapture` passa a orquestrar segmentos de texto (fecha um segmento por janela de tempo/silêncio) em vez de upload de áudio; a fila offline existente passa a guardar texto, não áudio criptografado.
- `AgendaMeetingEdgeClient` ganha `uploadTranscriptSegment(...)` em JSON e perde o caminho binário.
- `AgendaMeetingWorkspace` exibe transcript ao vivo, estado do reconhecimento e o aviso de navegador incompatível.

## Backend

- Migration aditiva (forward-only, idempotente): novo RPC `agenda_meeting_ingest_text_segment(...)` que grava recibo + segmento de transcrição em uma transação, sem exigir mime de áudio, sha256 de áudio nem callback externo, reaproveitando a mesma validação de sequência/idempotência já existente e enfileirando `assemble_transcript`. Nenhuma tabela existente é apagada ou recriada.
- `agenda-meeting-transcribe-segment` passa a aceitar JSON com texto validado (Zod-like guard: sessão, segmentId, sequência, janelas de tempo, texto com limite de tamanho) e chama o novo RPC. Remoção total do `DeepgramMeetingSttAdapter`.
- `supabase/functions/_shared/agenda-meeting/stt.ts` e a função `agenda-meeting-stt-callback` são removidas do projeto.
- `agenda-meeting-worker`: montagem da transcrição segue igual (não usa IA). A geração de ata é desacoplada — sem `OPENAI_API_KEY` o worker gera uma ata estruturada determinística a partir do próprio texto (cabeçalho do evento, participantes vinculados, blocos por período, itens marcados por padrões como "ficou decidido", "ação", "prazo") e conclui o job normalmente. Falha na ata nunca invalida a transcrição já salva.
- Nenhuma função do fluxo principal lê `OPENAI_API_KEY` ou `DEEPGRAM_API_KEY`.

## Auditoria e validação

- `rg` no projeto inteiro confirmando zero referências operacionais a Deepgram/OpenAI no caminho gravar → transcrever → salvar.
- Testes existentes de captura/upload atualizados para o novo contrato de texto.
- Validação no navegador real (Playwright/Chromium) no evento expandido: iniciar reunião, permissão de microfone, recebimento de resultados, encerramento e verificação por consulta no banco de que a transcrição foi persistida.
