# Reunião: transcrição contínua e confiável (correção estrutural)

## Diagnóstico (verificado no código atual)

Li `CaptureSegmenter.ts`, `NativeMeetingTranscriptionAdapter.ts` e `useAgendaMeetingCapture.ts`. O reconhecimento morre por razões estruturais, não por um bug pontual:

1. **O reconhecimento é destruído a cada 30 segundos.** `startCycle()` chama `transcription.start()` e `finishCycle()` chama `transcription.stop()`; `scheduleSegmentRotation()` dispara a cada `AGENDA_MEETING_SEGMENT_DURATION_MS = 30_000`. Ou seja, a cada ciclo o `SpeechRecognition` é encerrado e recriado — cada parada gera `aborted`/`onend` e uma janela cega, e em qualquer falha de `start()` a sessão fica muda para sempre (o `start()` do adapter engole a exceção).
2. **Erro do reconhecimento derruba a reunião inteira.** No `prepare()`, `onFatalError` chama `interrupt('capture_error')`, que muda o modo para `interrupted`, libera microfone e stream e encerra a captura. Não existe distinção entre erro recuperável e fatal.
3. **`visibilitychange` mata a sessão.** `onVisibilityChange` chama `interrupt('page_hidden')` sempre que a aba/tela fica oculta — no celular, bloquear a tela ou trocar de app encerra a reunião.
4. **MediaRecorder concorre pelo microfone sem servir a nada.** O áudio gravado é explicitamente descartado em `emitCompletedCycle` (só o texto vira segmento), mas o `MediaRecorder`/`AudioWorklet` continua ativo sobre o mesmo stream, aumentando conflito de captura e falhas em mobile.
5. **Sem máquina de estados nem trava de reinício.** O adapter usa apenas `running` + `restartTimer` de 250 ms fixo, sem contador de tentativas, cooldown, proteção contra `start()` duplicado nem estado observável pela UI.
6. **Sem deduplicação.** `drain()` apenas concatena buffers; sobreposição entre reinícios não é tratada.

## O que muda para o usuário

- Ao iniciar a reunião: pedido de microfone uma única vez, e a transcrição ao vivo aparece e **continua** (texto confirmado + texto provisório em cinza).
- Silêncio, pausas longas e reinícios internos do navegador não interrompem nada: o estado mostra "Transcrevendo…" / "Recuperando…" sem alarme vermelho.
- Pausar/retomar e encerrar funcionam; ao encerrar, o texto acumulado é consolidado e salvo no evento e permanece visível ao reabrir o evento.
- Navegador sem suporte nativo recebe aviso claro (Chrome/Edge), sem transcrição falsa.

## Implementação

### Controlador único de reconhecimento
Reescrever `NativeMeetingTranscriptionAdapter` como controlador autoritativo com máquina de estados explícita: `idle → requesting_permission → initializing → listening → speech_detected → recovering → paused → stopping → finalizing → completed | error`.

- Instância única guardada em ref; `startLock` + `pendingStart` impedem `.start()` concorrente; handlers completos (`onstart`, `onaudiostart`, `onspeechstart`, `onresult`, `onspeechend`, `onaudioend`, `onend`, `onerror`).
- `onend` inesperado com sessão ativa → `recovering` → reinício controlado com backoff (250 ms → 500 ms → 1 s → 2 s, teto 5 s), contador de tentativas por janela e cooldown; reinício bem-sucedido zera o contador. Sem loop infinito.
- Classificação de erros: `no-speech`, `aborted`, `network`, `audio-capture` (com stream válido) = recuperáveis; `not-allowed`, `service-not-allowed`, `language-not-supported` = fatais com ação clara ao usuário. Somente fatais interrompem a sessão.
- `pt-BR`, `continuous = true`, `interimResults = true`, com continuidade garantida pela camada de aplicação (não confia no `continuous` do navegador).

### Texto sem perda e sem duplicação
- `finalSegments[]` (append-only, nunca zerado em reinício), `interimTranscript` (volátil, só UI), `canonicalTranscript` derivado.
- Deduplicação por sobreposição de sufixo/prefixo normalizado (comparação de até N palavras entre o fim do segmento anterior e o início do novo), sem reescrever conteúdo.
- `drain()` passa a entregar apenas o texto ainda não persistido, mantendo o acumulado íntegro no controlador.

### CaptureSegmenter simplificado
- Remover `MediaRecorder`/`AudioWorklet` do caminho da reunião (o áudio já era descartado); manter apenas `getUserMedia` + `AnalyserNode` para o indicador de nível, e o reconhecimento.
- A rotação de 30 s deixa de parar o reconhecimento: passa a ser apenas um *flush* de texto (drena finais acumulados e emite o segmento), com o reconhecimento vivo do início ao fim.
- `visibilitychange` deixa de interromper: vira sinal de UI; `pagehide`/`track_ended` continuam interrupções reais. O microfone só é liberado no encerramento real ou em falha fatal.
- Ciclo de vida em refs (`recognitionRef`, `streamRef`, `meetingActiveRef`, `shouldRestartRef`, `restartTimerRef`) para sobreviver a rerenders e ao StrictMode; efeitos de limpeza só encerram quando a sessão realmente termina.

### Encerramento e persistência
Ordem no "Encerrar reunião": marcar parada manual → desligar reinício automático → aguardar último resultado final (janela curta) → `stop()` do reconhecimento → consolidar `finalSegments` → limpar/normalizar → persistir texto canônico via a ingestão de texto já existente (`agenda_meeting_ingest_text_segment` / `agenda-meeting-transcribe-segment`) → marcar sessão concluída → exibir transcrição completa. Nunca finaliza vazio se houver segmentos válidos. Nada de OpenAI/Deepgram.

### UX e diagnóstico
- Estados visíveis: microfone pronto, ouvindo, fala detectada, recuperando, pausado, finalizando, concluído. Reinícios internos não exibem erro.
- Logs de diagnóstico (start/end/error/restart/contagem de finais) atrás de um flag de debug, silenciosos em produção.

## Validação

- Testes unitários atualizados/novos: reinício controlado após `onend`, preservação de `finalSegments` entre reinícios, deduplicação por sobreposição, erros recuperáveis vs. fatais, flush de 30 s sem parar o reconhecimento, ordem de encerramento.
- Verificação no navegador real (Chromium/Playwright) do fluxo de UI, permissão de microfone e persistência por consulta ao banco.
- Limitação honesta: o Chromium do sandbox não possui o serviço de reconhecimento de voz do Google, então a fala real não pode ser simulada aqui de ponta a ponta. Vou validar tudo o que é validável automaticamente e entregar o roteiro de 30 s / 2 min / 5+ min no Chrome desktop e no Chrome Android para a confirmação final com microfone real — ajustando qualquer regressão que aparecer nesse teste.
