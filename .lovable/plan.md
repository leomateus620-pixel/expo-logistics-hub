# Reunião: eliminar o erro genérico `meeting_persistence_failed`

## O que o diagnóstico mostra

O navegador está 100% saudável: microfone concedido, faixa de áudio ativa, reconhecimento nativo disponível. A falha acontece só no passo `STEP_CONTROL_START`, ou seja, no backend, ao criar a sessão de reunião.

`meeting_persistence_failed` **não é a causa** — é o rótulo genérico usado quando o backend recebe um erro do banco que não sabe traduzir. Hoje qualquer erro não previsto vira essa mesma mensagem, então a causa real está sendo apagada antes de chegar à tela. Verifiquei o banco: não existe nenhuma sessão de reunião gravada e nenhum recibo de mutação, o que confirma que a transação de criação está sendo revertida por completo.

## Causas candidatas já mapeadas (nenhuma confirmada ainda)

Lendo a rotina de criação no banco, há erros que ela pode disparar e que hoje caem todos no mesmo rótulo genérico:

- `AGENDA_MEETING_INVALID_CONSENT_ACTOR` — o registro de consentimento exige que quem inicia esteja como membro **ativo** da organização (existem 6 membros inativos hoje).
- `AGENDA_MEETING_EVENT_NOT_FOUND` — evento não encontrado no par evento/organização enviado.
- `AGENDA_MEETING_MUTATION_ID_REQUIRED` / `AGENDA_MEETING_INVALID_REQUEST` — dados obrigatórios ausentes na chamada.
- Qualquer violação de restrição/gatilho durante a gravação da sessão.

## Plano

1. **Tornar o erro real visível (primeiro passo obrigatório).**
   Na função `agenda-meeting-control`, registrar no log do servidor o código e a mensagem originais do banco e devolver ao cliente um código de erro específico em vez do genérico. O painel de diagnóstico da reunião passa a mostrar esse código.

2. **Traduzir corretamente os erros conhecidos.**
   No tradutor de erros compartilhado (`_shared/agenda-meeting/supabase.ts`), acrescentar as regras que faltam:
   - consentimento/ator inválido → 422 `meeting_consent_actor_invalid` ("seu usuário não está ativo na organização")
   - evento não encontrado → 404 `meeting_event_not_found`
   - requisição inválida → 400 `invalid_request`
   Só sobra `meeting_persistence_failed` para falhas realmente inesperadas de infraestrutura.

3. **Reproduzir e confirmar a causa.**
   Chamar a função diretamente com o usuário autenticado e ler os logs, para ver o erro original agora exposto.

4. **Corrigir a causa confirmada.** Conforme o resultado do passo 3, por exemplo:
   - se for ator de consentimento: garantir/normalizar o vínculo ativo do usuário na organização e permitir início por membro ativo;
   - se for restrição do banco: migração corrigindo a regra;
   - se for contrato: ajuste no cliente.

5. **Validar ponta a ponta.**
   Iniciar uma reunião real no evento, confirmar sessão criada no banco, cronômetro correndo, transcrição ao vivo aparecendo e finalização gerando a ata.

## Mensagens ao usuário

Substituir o texto atual "Não foi possível concluir esta etapa" por mensagens específicas por código (permissão, evento inexistente, indisponibilidade temporária com opção de repetir), preservando a regra de nunca inventar nem descartar conteúdo silenciosamente.

## Detalhes técnicos

- Arquivos: `supabase/functions/agenda-meeting-control/index.ts`, `supabase/functions/_shared/agenda-meeting/supabase.ts`, `supabase/functions/_shared/agenda-meeting/http.ts` (log estruturado), painel de diagnóstico e mapa de mensagens no cliente da feature.
- Nenhum dado sensível vai para o cliente: mensagem bruta do banco só no log do servidor; ao cliente vai apenas o código classificado.
- Migração de banco só entra se o passo 3 apontar defeito de esquema/gatilho.
