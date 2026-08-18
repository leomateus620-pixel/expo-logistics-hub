# Responsável correto no cadastro de evento + convidado livre

## O que está acontecendo

Verificado nos dados: nos eventos criados pelo Fabiano Soltis, o campo "Responsável" gravado é o do Djeison Drey (ex.: "PAINEL LICENCIAMENTO AMBIENTAL", "JANTAR DE ENCERRAMENTO...", "CONGREGACOOP CÓRDOBA"). O motivo é como o formulário decide quem é o responsável:

- O nome do usuário logado é apenas escrito no campo de texto "Responsável", mas ele **não** entra na lista "Responsáveis do evento".
- Na lista, quem virar a **primeira pessoa selecionada** recebe automaticamente a estrela de "Responsável"; todos os demais viram "Convidado".
- Ao salvar, o nome oficial do evento é sobrescrito pelo primeiro selecionado. Como o Djeison costuma ser o primeiro nome escolhido, ele fica como responsável mesmo quando quem cadastra é o Fabiano.
- Hoje, quando alguém já é "Responsável", não existe botão para rebaixá-lo a "Convidado" — só é possível transferir a estrela para outra pessoa.

## O que muda

1. **Quem cadastra entra como Responsável automaticamente.** Ao abrir "Novo evento", o usuário logado já aparece na lista "Responsáveis do evento" marcado como Responsável (com foto/iniciais e cargo). Se ele não quiser, pode remover ou passar a estrela para outra pessoa.
2. **Selecionar outra pessoa não rouba mais o posto.** Novas pessoas adicionadas entram como Convidado; a estrela só muda quando o usuário clicar em "Definir como responsável".
3. **O responsável gravado é o marcado na lista.** O nome exibido no evento passa a ser sempre o que está com a estrela. Se ninguém estiver marcado, usa o nome de quem cadastrou.
4. **Opção de tornar o primeiro um convidado.** O item marcado como Responsável ganha a ação "Tornar convidado", permitindo que o evento fique só com convidados ou que a estrela seja liberada para outra pessoa. A mesma regra vale para "Área principal" nas comissões.
5. Eventos já existentes não são alterados; a correção vale para novos cadastros e edições feitas a partir de agora.

## Detalhes técnicos

- `src/components/cronograma-eventos/EventForm.tsx`: no efeito `autoOwnerAppliedRef`, além de preencher `owner`, injetar o usuário logado em `responsiblesRel` (`userId` real, `isPrimary: true`, `role` = cargo do membro) quando for evento novo e a lista estiver vazia. Resolver o membro por `user_id` em `loginMembers`/`members` (há homônimos com `is_core_team = false`; priorizar o registro `is_core_team = true`).
- `RelationalMultiSelect.tsx`:
  - `addOption`/`addCustom`/`addMany`: manter `isPrimary: false` quando já existe um primário — comportamento atual — e não promover automaticamente o próximo item em `removeAt` (deixar a lista sem primário até escolha explícita).
  - Item primário passa a renderizar botão "Tornar convidado" (variant `person`) / "Remover destaque" (variant `organization`) que zera `isPrimary`, em vez de um rótulo estático.
- `modelAdapter.ts` (linha 148): `owner` deve usar `responsiblesRel.find(isPrimary)` e só cair para `event.responsibleName` quando não houver nenhum primário — remover o fallback silencioso para o primeiro da lista, que é o que hoje elege o Djeison.

## Validação

- Entrar como um usuário, abrir "Novo evento" e conferir que ele já aparece como Responsável.
- Adicionar duas outras pessoas e confirmar que entram como Convidado.
- Clicar em "Tornar convidado" no responsável e confirmar que a lista fica sem responsável, e que ao salvar o evento mostra o criador.
- Salvar e reabrir conferindo persistência.
