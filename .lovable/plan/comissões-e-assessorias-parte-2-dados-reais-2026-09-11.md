# Comissões e Assessorias — Parte 2: dados reais

A interface da PR #143 permanece como está. Esta etapa liga essa interface aos dados verdadeiros: agenda, pessoas, documentos, permissões e indicadores.

## O que já existe (verificado agora)

- O vínculo entre evento e comissão já é relacional: a tabela de ligação guarda o identificador real da comissão em 100% das 178 linhas atuais, e já distingue "principal" (dona do evento) de "participante".
- O formulário de criação/edição de evento da Agenda Fenasoja já grava comissões e pessoas relacionadas por identificador, em uma única chamada com controle de concorrência.
- Já existe um espaço de armazenamento privado para anexos de evento, com regras de acesso ativas.
- O que ainda não está ligado no workspace da comissão: a busca de eventos é feita por apelido/slug (e carrega até 500 registros para filtrar), a área Documentos está fixa como vazia, e os botões "Criar evento" e "Publicar documento" só exibem um aviso de "em preparação".

## O que será feito

### 1. Agenda da unidade por identificador real
- Nova consulta no banco que devolve, para uma unidade, os eventos em que ela é dona ou participante, já com pessoas, comissões relacionadas e contagem de documentos.
- O workspace passa a usar `useUnitAgenda(unitId)`; some o filtro por nome/slug e o carregamento em massa. O slug continua servindo só para a URL.
- Compatibilidade: eventos antigos ligados apenas pelo campo de texto de comissão recebem backfill para a tabela relacional, sem apagar o campo antigo.

### 2. Um único evento em todas as agendas
- Criar evento dentro de uma comissão abre exatamente o mesmo formulário da Agenda Fenasoja, com a unidade já pré-selecionada e marcada como dona.
- Criar pela Agenda Fenasoja e marcar uma comissão faz o evento aparecer na agenda dela — mesmo registro, mesmo identificador, sem cópia.
- Evento com Marketing (dona) + Imprensa + Comissão Central aparece nas três agendas.

### 3. Quando aparece na Agenda Fenasoja
Regra única e centralizada: o evento entra na timeline central quando a Comissão Central estiver relacionada, quando alguém da Comissão Central estiver relacionado, ou quando ele tiver nascido na Agenda Fenasoja. Evento só da comissão fica só na agenda dela — mas continua contando nos indicadores gerenciais (quantidade sim, conteúdo não).

### 4. Regras de acesso em um só lugar
Um módulo com as decisões `podeVer`, `podeEditar`, `podeGerenciar`, `apareceNaAgendaCentral` e `podeGerenciarDocumentos`, usado pela interface — e replicado como regra no banco, para que esconder botão não seja a única proteção. Presidência/principais e membros autorizados agem na própria unidade; ninguém age em nome de outra. Excluir evento, trocar ou remover a unidade dona e excluir documentos ficam restritos aos papéis mais altos.

### 5. Documentos de verdade
A área Documentos passa a enviar, listar, abrir, baixar e excluir (quando permitido), com documento geral da unidade e documento ligado a um evento — sem duplicar arquivo. Validação de tipo, tamanho e nome; arquivos privados com acesso temporário assinado.

### 6. Indicadores corretos
Próximo evento, eventos no mês, futuros, concluídos, contador da aba Agenda e eventos por comissão passam a vir do banco. Um evento ligado a três comissões conta uma vez no total global.

### 7. Sincronização de telas
Após criar/editar evento, vínculo, documento ou status, as telas afetadas (agenda da unidade, visão geral, Agenda Fenasoja, dashboards, detalhe do evento, documentos) atualizam sozinhas por invalidação de cache — sem recarregar a página.

## Detalhes técnicos

- Migration aditiva: coluna `origin_source` em `cronograma_eventos` (agenda_central | unidade) para a regra de propagação; índices em `cronograma_evento_comissoes(commission_id, event_id)` e `cronograma_evento_responsaveis(org_member_user_id)`; backfill de `commission_slug` legado para a tabela de ligação; sem `DROP`.
- Novas funções `security definer`: `cronograma_unit_agenda(_commission_id uuid, ...)` e `cronograma_unit_metrics(_commission_id uuid)`; RLS revisada em `cronograma_evento_comissoes`, `cronograma_evento_responsaveis` e `cronograma_evento_anexos` para autorizar escrita por vínculo de unidade além dos papéis de org atuais, sem reduzir o acesso já existente.
- Documentos reutilizam o bucket privado `cronograma-event-attachments` (novo prefixo `unidades/<commission_id>/` para documentos gerais) com políticas de storage por unidade; nada de service_role no frontend.
- `cronograma.adapter.ts` continua sendo a camada Database → Domain → ViewModel; `AgendaEventViewModel` passa a receber `units[]`, `people[]`, `documents`, `documentCount`, `status`, `location`, `description`, data/hora reais.
- Criação de evento reutiliza `EventForm` / `cronograma_save_event` (sem formulário paralelo), recebendo a unidade pré-selecionada como `relation_role: 'principal'`.
- Testes: cenários A–G do pedido como testes automatizados sobre as regras de visibilidade e a agenda por unidade, mais verificação de TypeScript, build e checagem responsiva de 320px a desktop (sem overflow horizontal).
- Nada será publicado em produção.
