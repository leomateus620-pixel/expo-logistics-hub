Vou tratar isso como uma correção única de ponta a ponta, não como novas fases experimentais.

**Evidência já confirmada**
- O callback do Google está chegando no app: a tentativa mais recente registrou `attempt` + `code` + `success`.
- O retorno não trouxe `state` (`has_state: false`), mas o código atual exige `state` para prosseguir.
- O callback também chegou sem sessão autenticada do app (`auth_present: false`), mas o endpoint `complete` atualmente exige usuário autenticado antes de finalizar.
- Resultado: a conexão fica em `waiting_authorization`, não troca o `code` por uma chave de conexão, não cria/verifica o calendário FENASOJA e não dispara a sincronização dos eventos.

**Plano de correção definitiva**
1. **Finalizar OAuth pelo `attemptId`, sem depender da sessão do popup**
   - Atualizar o callback para considerar válido o retorno `attempt + code + success`, mesmo sem `state`.
   - Atualizar o backend para permitir `complete` anônimo somente quando houver `attemptId` explícito válido, pendente, não expirado e vinculado à conexão ativa.
   - Manter validação forte: tentativa única, status correto, expiração, caminho de callback correto e consumo atômico para impedir replay.

2. **Manter `state` quando existir, mas não bloquear quando o gateway não devolve**
   - Se `state` vier no callback, comparar com o hash salvo.
   - Se `state` não vier, confiar no `attemptId` gerado pelo servidor e no `code` one-time do gateway para finalizar a autorização.

3. **Garantir gravação da conexão e calendário antes de mostrar sucesso**
   - Trocar o `code` pelo `connection_key`.
   - Salvar a chave na conexão correta do usuário/organização.
   - Provar acesso ao Google Agenda.
   - Criar ou recuperar o calendário secundário “FENASOJA — Cronograma”.
   - Só então marcar a conexão como `connected`/`synchronizing` com `secondary_calendar_id` e `verified_at` preenchidos.

4. **Sincronizar todos os eventos existentes após conectar**
   - Enfileirar todos os eventos do Cronograma com data, respeitando a regra já existente de acesso.
   - Acionar o worker imediatamente após a conexão.
   - Corrigir qualquer ponto que impeça o worker de sair de `queued` para eventos reais no Google Agenda.

5. **Limpar o estado quebrado atual antes do novo teste**
   - Encerrar tentativas presas em `waiting_authorization`.
   - Restaurar a conexão do Leonardo para estado limpo de reconexão.
   - Preservar dados de cronograma/eventos; a limpeza será apenas do estado OAuth/sync travado.

6. **Validação final obrigatória**
   - Testar o endpoint de status.
   - Fazer uma nova conexão pelo widget.
   - Confirmar no banco que a conexão ficou com `secondary_calendar_id` e `verified_at`.
   - Rodar o worker.
   - Confirmar que os registros foram criados em `google_calendar_event_map` e que a fila não ficou travada.
   - Validar um evento específico no Google Agenda conectado, incluindo “ENCONTRO REGIONAL DE INOVAÇÃO E EMPREENDEDORISMO” se ele estiver elegível para sincronização.

**Arquivos que serão ajustados**
- `src/lib/google-calendar-callback.ts`
- `src/pages/GoogleCalendarCallbackPage.tsx`
- `supabase/functions/google-calendar-oauth/index.ts`
- Se necessário após validação: `supabase/functions/google-sync-worker/index.ts`

**Critério de pronto**
- O botão “Conectar Google Agenda” termina em sucesso real.
- A conta conectada aparece no widget.
- O calendário FENASOJA é criado/recuperado no Google Agenda.
- Eventos do Cronograma aparecem no Google Agenda conectado.
- A interface não fica mais presa em “Aguardando autorização” ou “Confirmando autorização”.