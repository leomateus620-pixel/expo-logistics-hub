# Reunião: finalizar com segurança e gerar ata + resumo

## O que os dados mostram (verificado no banco)

Sessão real da reunião de hoje (evento "teste", iniciada 02:11:22 UTC):

- Os 8 trechos de transcrição foram gravados com sucesso (`transcribed`, sequências 0 a 7, sem lacunas: `missing_sequences = {}`).
- O último "sinal de vida" (heartbeat) da tela chegou às **02:11:39** — 16 segundos após o início. Depois disso a gravação continuou por mais 10 minutos, mas nenhum heartbeat novo chegou.
- Por isso a rotina automática de limpeza marcou a sessão como `interrupted` às 02:15 (`last_error_code = capture_heartbeat_expired`) e subiu a versão da sessão de 1 para 2.
- A tela continuou achando que estava na versão 1. Ao clicar em **Finalizar**, ela envia a versão que conhece; o servidor recusa por conflito de versão e devolve o erro genérico "Não foi possível concluir esta etapa". A sessão ficou presa em `interrupted`, sem `closed_sequence`, sem ata e sem resumo (nenhum job de processamento foi criado).

Ou seja: a transcrição está correta; o que quebra é o controle de estado no encerramento.

## Correções

### 1. Heartbeat resiliente (causa da interrupção)
- Enviar o heartbeat sem exigir versão específica (é uma operação que não altera versão), eliminando a classe inteira de falhas por versão desatualizada.
- Manter o envio também nas fases `paused` e `interrupted`, e disparar um heartbeat imediato ao iniciar/retomar, em vez de esperar 15 s.
- Ao receber resposta, sempre ressincronizar a versão local; ao falhar, registrar no painel de diagnóstico em vez de engolir o erro em silêncio.
- Se o servidor responder que a sessão foi marcada como interrompida enquanto a captura segue ativa, reativar automaticamente (`resume`) e continuar gravando, sem travar a tela.

### 2. Finalizar sempre conclui
- Finalizar deixa de enviar versão esperada (o encerramento é a última operação da sessão e é protegida por bloqueio no banco).
- Se ainda assim houver conflito, reconsultar o detalhe da sessão, adotar a versão atual e repetir uma vez antes de exibir erro.
- Aceitar finalizar a partir do estado `interrupted` (o banco já permite) e informar na tela quando a cobertura for parcial.
- Mensagens de erro específicas no lugar do texto genérico, mantendo o token técnico no diagnóstico.

### 3. Recuperar a sessão travada de hoje
- Encerrar a sessão presa pelo caminho oficial (`finalize` com a última sequência conhecida), para que a transcrição de 10 minutos seja consolidada, versionada e passe pela geração de ata/resumo.

### 4. Ata, resumo e pontos abordados garantidos
- Confirmar que, ao finalizar sem lacunas, o sistema enfileira a montagem da transcrição canônica e, na sequência, a análise (resumo executivo, decisões, ações e pontos abordados) — e que o agendador está executando esses trabalhos.
- Se a análise falhar ou demorar, a tela mostra o estado real ("montando transcrição", "gerando ata", "falhou — repetir análise") com botão de nova tentativa, em vez de ficar em branco.
- Após finalizar, o painel abre automaticamente a sessão recém-encerrada e atualiza sozinho até o resumo aparecer.

### 5. Fechamento do painel
- Com a sessão já encerrada, fechar o painel deixa de ser bloqueado; enquanto estiver gravando, continua pedindo confirmação.

## Detalhes técnicos
Arquivos envolvidos: `src/features/agenda-meeting-intelligence/hooks/useAgendaMeetingCapture.ts` (heartbeat, finish, recuperação de versão), `src/components/cronograma-eventos/meeting-intelligence/AgendaMeetingWorkspace.tsx` (mensagens, estados de processamento, seleção automática da sessão, fechamento), `supabase/functions/_shared/agenda-meeting/supabase.ts` (mapeamento de erro de conflito de versão). Nenhuma alteração de esquema é necessária; a recuperação da sessão travada é operação de dados.
