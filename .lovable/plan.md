# Inteligência de Reuniões — conclusão do backend (Agenda FENASOJA)

## Diagnóstico já executado (somente leitura, projeto conectado `btfaumhroqtqzxomqorx`)

Causa raiz confirmada da mensagem "Não foi possível consultar o histórico com sua sessão atual":

1. **Migration nunca aplicada.** Consulta ao catálogo do banco retornou **zero** tabelas com prefixo `agenda_meeting_%`. O arquivo `supabase/migrations/20260813234500_create_agenda_meeting_intelligence_v2.sql` (2.735 linhas, 13 tabelas + ~30 funções + policies + cron) existe no repositório mas nunca foi executado no projeto. Logo, as RPCs `agenda_meeting_authorize` / `agenda_meeting_control` não existem e a Edge Function falha em toda chamada `list`.
2. **Allowlist de CORS ausente.** O segredo `AGENDA_MEETING_ALLOWED_ORIGINS` não está configurado. O helper `_shared/agenda-meeting/http.ts` falha fechado devolvendo `Access-Control-Allow-Origin: null`, o que bloquearia o navegador mesmo com o banco correto.
3. **Credenciais de provedor ausentes.** Não existem `DEEPGRAM_API_KEY`, `DEEPGRAM_API_KEY_ID`, `OPENAI_API_KEY` nem `AGENDA_MEETING_WORKER_TOKEN`. Sem elas não há como validar transcrição e análise reais — e nenhum mock será usado.

Não há implantação parcial: o ambiente está limpo, então o arquivo original pode ser aplicado integralmente como uma única migration nativa, sem reescrita e sem migration aditiva de reconciliação.

## O que será executado após aprovação

### Etapa 1 — Migration (executável agora)
- Aplicar o arquivo `20260813234500_create_agenda_meeting_intelligence_v2.sql` byte a byte via a ferramenta de migration, sem reset e sem alterar migrations anteriores.
- Conferir extensões `pgcrypto`, `pg_net`, `pg_cron`, `vault`; parar e reportar NO-GO se alguma indispensável faltar.
- Validar após aplicar: 13 tabelas, FK composta `(event_id, org_id)`, unicidades de sequência/`mutation_id`/SHA-256, limite `active_duration_ms ≤ 14.400.000`, triggers append-only, índices, RLS habilitada em todas as tabelas e ausência de grants de escrita direta para `authenticated`.
- Confirmar registro em `supabase_migrations.schema_migrations` e recarregar o schema cache do PostgREST.

### Etapa 2 — Secrets e Vault
- Registrar `AGENDA_MEETING_ALLOWED_ORIGINS` com as origens exatas (preview Lovable + `https://fenasojagestao.com`, `https://www.fenasojagestao.com`), separadas por vírgula, sem `*`.
- Gerar `AGENDA_MEETING_WORKER_TOKEN` (valor aleatório, nunca exibido).
- Solicitar `DEEPGRAM_API_KEY`, `DEEPGRAM_API_KEY_ID` e `OPENAI_API_KEY` pelo formulário seguro — dependem de você.
- Inserir no Vault `agenda_meeting_worker_service_role_key` e agendar `invoke_agenda_meeting_worker` a cada minuto via `pg_cron` + `pg_net` (SQL de dados, não migration, por conter chave do projeto).

### Etapa 3 — Edge Functions
- Publicar as quatro funções já existentes no repositório: `agenda-meeting-control` (`verify_jwt = true`), `agenda-meeting-transcribe-segment` (`verify_jwt = true`), `agenda-meeting-stt-callback` (`verify_jwt = false`, token opaco por tentativa), `agenda-meeting-worker` (`verify_jwt = false` + token interno).
- Conferir no código, sem reescrever contratos, o tratamento de `max_duration`: ao atingir 4 horas precisa parar captura, fechar o último segmento, calcular `lastSequence`, chamar `finalize`, bloquear `resume` e exibir "Limite de 4 horas atingido". Se hoje apenas pausar, será corrigido no cliente/servidor conforme a regra.
- Conferir o fluxo de fechamento do drawer durante gravação (confirmação + `finalize` persistido antes de desmontar) e `meta: { persist: false }` nas queries de transcrição/ata.

### Etapa 4 — Validação remota real
- `list`/`detail` com JWT real de usuário membro, em evento persistido de `cronograma_eventos`, comprovando fim da mensagem vermelha (histórico vazio → "Nenhuma sessão registrada").
- Sessão consentida real, captura de 60–90 s (≥2 segmentos), recibos sequenciais, callbacks `transcribed`, texto persistido, refresh mantendo histórico, pausa/retomada, finalize com versão canônica + análise.
- Idempotência (callback e mutation repetidos), isolamento entre organizações e papéis, negação de escrita direta pelo cliente, teste controlado do limite de 4 h, e verificação de ausência total de áudio em Storage/SQL/logs.
- Desktop e mobile no fluxo autenticado.

## Bloqueio conhecido
As etapas 1–3 (exceto chaves de provedor) são executáveis agora. Os itens 6–14 e 18 da validação exigem `DEEPGRAM_API_KEY` e `OPENAI_API_KEY` reais; sem elas a entrega fica **NO-GO parcial**: estrutura pronta, transcrição não comprovada, e nada será simulado.

## Detalhes técnicos
- Nenhuma tabela existente é alterada; nenhuma rota nova é criada; `/cronograma-eventos`, EventDrawer, MobileEventScreen, Google Calendar e organizações permanecem intactos.
- `service_role` só é usado depois da validação do JWT do usuário nas Edge Functions.
- Nenhum áudio é persistido: apenas recibos, transcrição textual, atas, insights, ações, jobs e auditoria.
