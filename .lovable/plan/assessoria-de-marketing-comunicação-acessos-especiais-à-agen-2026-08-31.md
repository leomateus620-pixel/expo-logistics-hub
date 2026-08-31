# Assessoria de Marketing/Comunicação + acessos especiais à Agenda Fenasoja

## O que foi verificado antes do plano

- Existe hoje a unidade oficial **Assessoria de Marketing** (`assessoria-de-marketing`) — será renomeada, sem recriar.
- Existe a unidade **Assessoria de Imprensa**, com **Deise Anelise Froelich** e **Francine Maria Boijink** já vinculadas e ativas. Nada muda para elas.
- Existe a unidade **Fotografia**, cujo único membro é **Jonas (Fotógrafo)**.
- O e-mail informado no "Usuário 2" (`jmmirsan@gmail.com.br`) **já é a conta do Jonas**. Ou seja, não é um usuário novo: é o mesmo Jonas do item 5. Serão criados apenas dois acessos novos: `souduosocial@gmail.com` e `will@filmesdowill.com`.
- `souduosocial@gmail.com` e `will@filmesdowill.com` não possuem conta nem cadastro anterior com nome — os perfis ficarão sem nome inventado, aguardando preenchimento.
- Visualizar tudo sem editar já é possível na estrutura atual (perfil "leitura" sem a marcação de acesso restrito enxerga todos os eventos e o banco bloqueia edição). Não é preciso inventar um perfil novo.
- A regra de "evento relacionado" para Google Calendar hoje considera comissão/assessoria, mas **não** considera vínculo individual em um dos modos de sincronização; e os lembretes por e-mail hoje só saem por vínculo de comissão, ignorando o vínculo individual. Esses dois pontos serão corrigidos.

## Entregas

### 1. Renomear a assessoria (sem duplicar)
Atualizar o registro existente para **ASSESSORIA DE MARKETING/COMUNICAÇÃO**, preservando ID, histórico, eventos e vínculos.

### 2. Jonas migra para a nova assessoria
Mesmo usuário, mesma foto, mesmo histórico: apenas troca o vínculo de Fotografia para Assessoria de Marketing/Comunicação, mantendo a função **FOTÓGRAFO**. A unidade "Fotografia" fica sem membros e será desativada da exibição (sem apagar registros, evitando referências órfãs). O Jonas passa a enxergar toda a Agenda, como os demais da assessoria.

### 3. Dois novos acessos
Criar as contas de `souduosocial@gmail.com` e `will@filmesdowill.com` pela função administrativa segura de criação de usuários (senha só trafega pelo Auth; nada em código, perfil, log ou frontend). Ambos entram como membros ativos da Assessoria de Marketing/Comunicação, perfil somente leitura, com permissão de abrir a **Agenda Fenasoja**.

### 4. Imprensa preservada
Deise e Francine permanecem na Assessoria de Imprensa. Apenas padronização visual do nome, sem mexer em vínculos.

### 5. Ver tudo, editar nada de terceiros
Os três (Jonas, Will e o usuário Souduo) enxergam **todos** os eventos da Agenda, e o banco recusa qualquer alteração, exclusão, mudança de horário, participantes, comissão, anexos ou conclusão de eventos que não sejam deles. A regra vem do papel/vínculo, nunca de e-mail no código, então qualquer futuro integrante da assessoria herda o mesmo comportamento.

### 6. "Visível" ≠ "meu evento"
Notificação, e-mail e Google Calendar passam a usar uma definição única de **evento relacionado**: o usuário está vinculado individualmente ao evento **ou** o evento está vinculado a uma comissão/assessoria da qual ele é membro (ou ele mesmo criou o evento). Evento apenas visível não gera nada.

### 7. Google Calendar e e-mail sem duplicidade
Duplo vínculo (individual + assessoria) gera um único evento no calendário, uma notificação e um e-mail. Criação, alteração de data/horário, remoção de vínculo, cancelamento e conexão posterior do Google seguem o ciclo já existente, agora com a definição corrigida de evento relacionado.

## Detalhes técnicos

- Migração SQL:
  - `UPDATE public.commissions SET nome = 'ASSESSORIA DE MARKETING/COMUNICAÇÃO'` no ID `ed23de8f-…` (slug preservado); desativar `Fotografia` (`is_active=false`) após a migração do Jonas.
  - `UPDATE public.org_members` do Jonas: `commission_id` → assessoria de marketing, `cargo='FOTÓGRAFO'`; remoção do vínculo em `commission_responsibles` da Fotografia e recriação equivalente na nova assessoria.
  - Reescrever `public.google_user_eligible_for_event`: manter o modo `mine` estritamente pessoal e, nos demais modos, definir elegibilidade como `created_by_user_id = user` OR responsável direto em `cronograma_evento_responsaveis` OR membro (via `org_members.commission_id`) de comissão ligada em `cronograma_evento_comissoes`, mantendo o bloqueio de eventos de planejamento restrito. Nunca "todos os eventos visíveis".
  - Nova função `public.cronograma_event_related(_user_id, _org_id, _event_id)` como fonte única dessa definição, usada pela elegibilidade do Google e pelos lembretes.
  - Reforçar `cronograma_eventos_update/delete` para exigir explicitamente papel operacional ou autoria própria (a leitura permanece ampla), garantindo bloqueio de mutação por RLS e não só na UI.
  - `INSERT` em `user_capabilities` com a capability do módulo Agenda para os novos usuários (sem `cronograma_scoped_access`, que restringe a visualização, e sem `full_access`).
- Edge Function `create-user`: usada como está para provisionar os dois e-mails; validação prévia por `auth.users` para não duplicar conta. Se o provedor rejeitar `jmmirsan@gmail.com.br`, nada é alterado silenciosamente (nesse caso a conta já existe e é a do Jonas).
- Edge Function `event-reminders`: incluir responsáveis diretos (`cronograma_evento_responsaveis`) no conjunto de destinatários, unindo com os membros de comissão e deduplicando por `user_id|event_id|versão|offset` (chave de idempotência já existente).
- `google_sync_outbox` / `google_calendar_event_map`: manter o par `event_id + user_id → google_calendar_event_id` como chave de idempotência; remoção de vínculo dispara exclusão remota apenas quando nenhuma outra relação persistir.
- Frontend: nenhuma condicional por e-mail; a exibição do botão de edição continua derivada das mesmas regras do backend. Atualizar a visualização organizacional para exibir a nova assessoria com seus membros (Jonas como fotógrafo) e a Imprensa separada.

## Validação

Login real com os novos usuários: Agenda completa visível; edição de evento de terceiro recusada pelo backend; evento sem vínculo não gera e-mail/notificação/Calendar; evento vinculado individualmente e evento vinculado à assessoria geram um único fluxo cada; alteração de horário atualiza o evento remoto sem duplicar; Deise, Francine e Jonas conferidos nas estruturas corretas.
