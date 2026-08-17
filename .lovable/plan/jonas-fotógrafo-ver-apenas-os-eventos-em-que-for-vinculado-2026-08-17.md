# Jonas (Fotógrafo): ver apenas os eventos em que for vinculado

Hoje o Jonas enxerga todos os eventos da Agenda Fenasoja. A alteração restringe a visão dele apenas aos eventos onde ele estiver vinculado.

## O que muda

- Jonas passa a ver somente eventos em que:
  - ele estiver na lista de responsáveis/convidados do evento; ou
  - o evento estiver vinculado a uma comissão da qual ele seja responsável ativo.
- Continua somente leitura: nada de criar, editar ou excluir.
- Demais módulos seguem bloqueados.
- Nenhum outro usuário é afetado.

## Detalhes técnicos

- Adicionar a capability `cronograma_scoped_access` ao usuário `3e7f410c-c14d-4841-8597-8a84f1b8c639` na org FENASOJA (mantendo `cronograma_eventos_access`, sem `cronograma_eventos_write`).
- As policies já existentes de `cronograma_eventos`, `cronograma_subeventos`, `cronograma_evento_responsaveis`, `cronograma_evento_comissoes` e anexos usam `has_scoped_cronograma_access` + `cronograma_scoped_event_visible`, então o filtro passa a valer automaticamente no banco — não é preciso criar policies novas.
- O front (`useCronogramaEventos`) já detecta `cronograma_scoped_access` e ignora o catálogo local de eventos, exibindo apenas o que o banco retorna.

## Validação

- Conferir as capabilities gravadas para o usuário.
- Simular a visibilidade: contar quantos eventos passam por `cronograma_scoped_event_visible` para o id dele e comparar com o total do ciclo.
