# Reunião: encontrar a causa real da "Falha terminal" em 00:00:00

O objetivo desta etapa não é reescrever o motor de transcrição de novo. É **provar**, com a sequência real de eventos do navegador, por que a sessão entra em falha terminal antes do primeiro resultado de fala — e só depois corrigir exatamente essa causa.

## O que já está confirmado no código (sem especulação)

- `useAgendaMeetingCapture.start()` executa, em ordem: `segmenter.prepare()` → `control/start` (backend) → `segmenter.start()`. Qualquer exceção nesse bloco cai num único `catch`, que cancela a sessão e despacha `phase: 'fatal_error'` — **sem registrar em que passo falhou**.
- A mensagem exibida vem do `default:` de `errorMessage()` em `AgendaMeetingWorkspace.tsx`, ou seja, o código real do erro não está mapeado nem exibido. Por isso a tela mostra o texto genérico.
- `CaptureSegmenter.prepare()` faz `getUserMedia`, cria `AnalyserNode` e instancia o adaptador de reconhecimento; `onFatalError` do adaptador chama `interrupt('capture_error')`.
- A tela mostra "SESSÃO VINCULADA" com falha terminal: a sessão foi criada no backend e a falha ocorreu depois — mas o passo exato ainda **não está comprovado**. Não vou afirmar a causa antes de ver os eventos.

## Etapa 1 — Camada de diagnóstico (obrigatória, antes de qualquer correção)

Criar um coletor em memória (`meetingDiagnostics.ts`) que registra, em ordem cronológica, com timestamp monotônico:

- clique em "Iniciar reunião"; `isSecureContext`; `window.top === window.self`; origin; user agent;
- existência de `SpeechRecognition` / `webkitSpeechRecognition` e qual foi escolhido; existência de `navigator.mediaDevices`;
- `GUM_REQUEST` / `GUM_OK` / `GUM_ERROR(name)`; estado da track (`readyState`, `enabled`, `muted`, `label`);
- criação da instância, configuração aplicada (`lang`, `continuous`, `interimResults`, `maxAlternatives`, modo local quando existir);
- `RECOGNITION_START_CALLED`, exceção síncrona de `start()`, e todos os handlers: `onstart`, `onaudiostart`, `onsoundstart`, `onspeechstart`, `onresult`, `onspeechend`, `onsoundend`, `onaudioend`, `onerror(event.error, event.message)`, `onend`;
- estado da máquina de estados, contador de reinícios e **o motivo exato** que levou a sessão a terminal.

Saída: painel recolhível "Diagnóstico de reconhecimento" dentro do card da reunião (visível em dev e via `?meetingDebug=1` em produção), com botão "Copiar diagnóstico". Sem transcrição, sem tokens, sem dados sensíveis. Em produção sem a flag, a mensagem amigável permanece, mas passa a incluir o código real do erro.

## Etapa 2 — Corrigir a classificação de falha

- Nunca tratar `onend` isolado como terminal.
- Recuperáveis: `no-speech`, `aborted` sem parada manual, `network`, fim inesperado.
- Potencialmente terminais (com motivo gravado): `not-allowed`, `service-not-allowed`, `audio-capture`, `language-not-supported`, runtime sem suporte.
- No `catch` do `start()`: registrar o passo (`prepare` | `control_start` | `segmenter_start`) e propagar esse código para a UI, em vez de colapsar tudo em `fatal_error` genérico.
- Estado "gravando/ouvindo" só após `onstart` (idealmente `onaudiostart`). `getUserMedia` bem-sucedido deixa de ser suficiente.

## Etapa 3 — Um só dono do microfone

Auditar e remover do caminho crítico o que não serve à transcrição: `MediaRecorder`, `AudioWorklet`, rotação de chunks e backlog de áudio. Avaliar tornar o `getUserMedia` opcional (apenas medidor de nível), com fallback automático de iniciar o reconhecimento sem stream próprio caso a posse do microfone atrapalhe o `start()`. O fluxo de produção fica: clique → verificação de capacidade → `recognition.start()` → transcrição ao vivo → segmentos finais → texto canônico → banco.

## Etapa 4 — Contexto de execução e capacidade explícita

- Detectar iframe/preview vs. aba de topo e registrar isso no diagnóstico.
- Três estados de capacidade distintos na UI: `SUPORTADO_E_PRONTO`, `SUPORTADO_MAS_REQUER_CONFIGURAÇÃO`, `NÃO_SUPORTADO_PELO_RUNTIME` — nunca "falha terminal" para os dois últimos.
- Quando o runtime expuser reconhecimento local no dispositivo, consultar a disponibilidade de `pt-BR` antes de ativá-lo; se estiver apenas disponível para download, informar o estado em vez de configurar às cegas.

## Etapa 5 — Watchdog de inicialização

Após `recognition.start()`, se em ~4 s não chegar `onstart`, `onerror` nem `onend`, registrar `STARTUP_STALLED` no diagnóstico e mostrar esse estado — sem inventar transcrição e sem finalizar silenciosamente.

## Etapa 6 — Auditoria de ciclo de vida React

Mapear todos os pontos que chamam `stop()`, `abort()`, limpam refs, param tracks ou zeram timers, incluindo cleanups de `useEffect` e o comportamento sob Strict Mode, garantindo que o objeto de reconhecimento viva em ref estável e que nenhum rerender aborte a instância recém-iniciada.

## Validação — o que consigo provar e o que depende de você

Consigo executar no sandbox, com navegador real (Chromium + microfone falso), e reportar a sequência crua de eventos: existência do construtor, `getUserMedia`, `start()`, e qual erro chega. Isso identifica falhas de inicialização, contexto e ciclo de vida.

**Não consigo** produzir fala real em português nem acessar o serviço de reconhecimento do Chrome de dentro do sandbox headless. Por isso, os testes A–E (fala real, continuidade de 60 s, persistência e reabertura) e o teste mobile serão executados por você no domínio publicado, com o painel de diagnóstico ligado — e eu corrijo a partir do log copiado. Não vou declarar validação de produção sem essa evidência real.

## Detalhes técnicos

Arquivos afetados: `capture/NativeMeetingTranscriptionAdapter.ts`, `capture/CaptureSegmenter.ts`, `hooks/useAgendaMeetingCapture.ts`, `components/cronograma-eventos/meeting-intelligence/AgendaMeetingWorkspace.tsx`, novo `capture/meetingDiagnostics.ts` e novo componente de painel de diagnóstico. Sem mudanças de banco, sem OpenAI, sem Deepgram.
