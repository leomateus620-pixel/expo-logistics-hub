# Membros do sistema: apenas a equipe FENASOJA 2028

Hoje o grupo "Membros do sistema" lista as 14 contas que já fizeram login, o que traz gente da operação 2026 (Ricardo Caetano, Ricardo Emilio Zimmermann, Lucas Franken, Marcelo de Bairros, Micael Böck, Luis Fernando Furlanetto, Mobilidade Fenasoja) e também o Eduardo Santos.

## O que muda

O grupo passa a mostrar apenas a equipe 2028 (6 pessoas):

- Soltis — Presidente FENASOJA 2028
- Djeison Drey — Vice-presidente FENASOJA 2028
- Zélia Savoldi — Assessoria de Marketing
- Cléo — FENASOJA Feira
- Fernanda Secklereich
- Leonardo Mateus Stroschein

O Eduardo Santos sai desse grupo e continua disponível em "Responsáveis institucionais", pela comissão que ele preside no registro oficial.

A lista fica marcada no cadastro da equipe, então incluir ou remover alguém no futuro é só ligar/desligar essa marcação — sem mexer em código.

## Onde a lista reduzida se aplica

- Campo "Responsáveis do evento" e "Responsável" do Cronograma e Eventos.
- Seletor de responsável do cadastro de eventos Fenasoja.

Os módulos operacionais (transportes, veículos, carrinhos, patinetes, escala, despesas, equipe) continuam com a lista completa de equipe — reduzi-los a 6 pessoas quebraria as reservas e escalas existentes. Se quiser aplicar lá também, é só pedir depois.

## Detalhes técnicos

1. Migration: adicionar `org_members.is_core_team boolean not null default false` e atualizar `list_org_login_members` para retornar apenas membros ativos com `is_core_team = true` (mantendo o filtro de e-mail real, a exigência de login e o `is_org_member` interno).
2. Dados: marcar `is_core_team = true` para os 6 user_ids da equipe 2028.
3. `src/components/cronograma-eventos/EventForm.tsx`: nenhuma mudança de lógica — já consome `loginMembers`; apenas validar que o auto-preenchimento do "Responsável" continua funcionando com fallback no metadata do usuário logado quando ele não estiver na lista.
4. `src/components/fenasoja/EventForm.tsx`: trocar `members` por `loginMembers` no seletor "Responsável".
