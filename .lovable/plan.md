# Responsáveis do evento em branco + ajuste de nomes

## O que muda

1. **Campo "Responsáveis do evento" começa vazio** em todo novo evento. Hoje o sistema já insere automaticamente o nome de quem está cadastrando como responsável principal. Isso deixa de acontecer: o usuário escolhe livremente quem vincular.
2. **O campo "Responsável" continua preenchido** e fixo com o nome de quem está criando, como está hoje. Após salvar, o evento mostra esse nome como criador e a lista de responsáveis vinculados exatamente como foi escolhida.
3. **Nomes de usuários atualizados** no cadastro da equipe:
   - "Cléo — FENASOJA Feira" passa a "Cléo Antonio Rockenbach"
   - "Soltis" passa a "Fabiano Soltis"

   A troca vale para todos os lugares que exibem o nome (seletores, eventos, escala, relatórios), já que o nome é lido do cadastro do membro.

## Detalhes técnicos

1. `src/components/cronograma-eventos/EventForm.tsx`: no efeito de auto-preenchimento (`autoOwnerAppliedRef`), manter apenas `next.owner = currentUserName` e remover o bloco que popula `next.responsiblesRel` com o usuário logado. O envio (`handleSubmit`) já grava `responsiblesRel` a partir da seleção, então um evento sem responsáveis escolhidos é salvo sem vínculos.
2. Atualização de dados em `org_members.nome_exibicao` para os dois usuários (contas `fenasojafeira@gmail.com` e `soltis.fs@gmail.com`), mantendo `is_core_team` como está.
