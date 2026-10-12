# Retomada: CCPF, Entrevista/Podcast e cinco fotografias

## Situação atual
- A implementação não travou. Ela estava pausada para confirmar a conta de conferência, e o modo de edição foi desligado em seguida.
- Ainda não houve alteração de código, cadastros ou fotos. Nada foi publicado.
- Conta indicada para atribuir a inclusão e conferir a Agenda: `leomateus620@gmail.com`.
- Identidades confirmadas: Débora Letícia Bamberg, Thaís Bróglio, Sara Kirchhof Varela, Milton Racho (Presidente de Honra) e Ten. Cel. Vanessa Peripolli.
- Hoje o CCPF não existe no cadastro de comissões da Agenda. No Ecossistema, o conselho é formado por Marcos Eduardo Servat, Dário Júnior da Motta Germano e Elemar Antonio Lenz.

## 1. CCPF na Agenda, sem duplicar o Ecossistema
- Criar uma única unidade "CCPF — Conselho Consultivo Permanente Fenasoja" no cadastro institucional, depois de repetir a busca por nome, sigla e variações. Se já existir um registro equivalente, reutilizá-lo.
- Vincular Marcos, Dário, Elemar e Milton pelos usuários já existentes. A operação poderá ser repetida sem criar duplicidades e terá registro de auditoria em nome da conta indicada.
- O nó CCPF do Ecossistema passa a ler esses vínculos. A unidade fica fora das comissões inferiores e dos cards do portal, então continua havendo um único CCPF no topo.
- A busca do seletor encontra "CCPF" e o nome completo. Ao selecionar, aparecem só os integrantes vinculados.
- Cargos, contas, capacidades e permissões continuam como estão.

## 2. Entrevista e Podcast
- Acrescentar os dois tipos ao formulário, rótulos, filtros e visualizações, mantendo os cinco tipos atuais.
- Persistir `interview ↔ entrevista` e `podcast ↔ podcast` no campo de tipo que já existe, sem criar coluna nova.
- A sugestão automática segue a intenção do título: "Reunião para organizar um podcast" continua Reunião. A escolha manual sempre prevalece, e a categoria temática não muda.

## 3. Fotografias
- Usar os anexos 3 a 7 nesta ordem: Débora, Thaís, Sara, Milton e Vanessa. A associação é feita pelo ID de usuário confirmado, não por semelhança ou primeiro nome.
- Preservar os originais. Gerar versões otimizadas sem a borda escura e enquadradas para avatar redondo e quadrado, sem cortar o rosto. Rostos não serão alterados.
- Atualizar a fonte compartilhada usada pela Agenda e pelo Ecossistema, mantendo as iniciais como alternativa se a imagem falhar.

## 4. Validação e entrega
- Testar busca e integrantes do CCPF, ausência de um segundo CCPF, repetição segura, ida e volta dos dois tipos, classificação por intenção e fotos nos seletores, cartões, Comissão Central e Ecossistema.
- Conferir no computador e no celular com sessão autorizada, sem criar eventos reais nem disparar avisos.
- Verificar Sala dos Voluntários, Restaurante e Google Agenda.
- Registrar a decisão estrutural em `AGENTS.md` e incluir a tarefa no roadmap.
- Na entrega, separar o que mudou no código, o que foi aplicado ao banco e o que foi conferido. Não publicar sem pedido.

## Detalhes técnicos
- Cadastro: `commissions` + `commission_responsibles`, com `unit_type='assessoria'`, `is_official=true` e slug estável `ccpf`. O slug entra em `NON_PORTAL_UNIT_SLUGS`, e o resolvedor exclui esse slug do nível 4 e usa os vínculos dele como fonte do nó raiz, com os aliases atuais como alternativa.
- Tipos: atualizar `CronogramaKind`, `CronogramaEventType`, `typeLabels`, taxonomia, `modelAdapter` e as regras do classificador, com testes de mapeamento.
- Fotos: usar o fluxo de recursos do projeto, `personPhotos.ts` (por ID de usuário) e `optimizedPortraitUrl`.
