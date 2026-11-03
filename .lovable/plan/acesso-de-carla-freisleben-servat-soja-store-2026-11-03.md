# Acesso de Carla Freisleben Servat (Soja Store)

## O que ela vai poder fazer
- Entrar com o e-mail carlafreisleben@hotmail.com e a senha informada (conta já confirmada).
- Agenda Fenasoja: ver e editar só os eventos ligados à comissão Soja Store.
- Mapa Comercial: só ver. Sem vendas, edição ou Dashboard Comercial.
- Aparecer na Soja Store como "Carla Freisleben Servat", junto com Cristina (que continua como principal).

## Passos
1. Criar a conta pela função oficial de criação de usuários (já confirmada, sem e-mail de convite), nome CARLA FREISLEBEN SERVAT. Se o e-mail já existir, reaproveitar a conta.
2. Vincular à organização Fenasoja com perfil Leitura.
3. Permissões (mesmo modelo usado para os presidentes de comissão e para Cristina):
   - `cronograma_eventos_access` + `cronograma_scoped_access` (Agenda limitada às comissões dela)
   - `cronograma_eventos_write` limitado pelo escopo da comissão
   - `map.view` apenas
4. Adicioná-la como responsável da comissão Soja Store (tipo pessoa, papel membro), ligada à conta.
5. Conferir: entrar com a conta dela no preview e ver que a Agenda mostra só eventos da Soja Store e permite editar, que o mapa abre só para leitura e que a Dashboard Comercial fica bloqueada.

## Detalhes técnicos
- Antes de dar `cronograma_eventos_write`, confirmar nas funções de escrita (`_cronograma_require_writer`) que ele respeita `cronograma_scoped_access`; se não respeitar, usar o caminho de edição por responsável da comissão em vez da permissão global, para não abrir edição de toda a Agenda.
- Nenhuma mudança de RLS ou de código; só registros de dados.
- A senha não fica salva no repositório nem repetida no chat.
