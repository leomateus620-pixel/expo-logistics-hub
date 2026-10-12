# CCPF, tipos de atividade e fotografias institucionais

## Conferência realizada
- O banco consultado não possui uma unidade CCPF em `commissions`. O Ecossistema já possui o nó raiz `org:ccp`, cuja composição atual é resolvida por três nomes explícitos nos membros ativos: Marcos Eduardo Servat, Dário Júnior da Motta Germano e Elemar Antonio Lenz. Não é uma composição baseada em permissões administrativas.
- Milton Racho foi localizado como membro ativo, com identidade única encontrada e cargo de Presidente de Honra; atualmente não possui vínculo em `commission_responsibles`. Sua inclusão no CCPF está autorizada neste pedido.
- Foram confirmadas as identidades e os vínculos de Débora Letícia Bamberg (Comissão Central), Thaís Bróglio (Recepção e Eventos), Sara Kirchhof Varela (Assessoria de Relações Internacionais) e Ten. Cel. Vanessa Peripolli (Segurança).
- O formulário oferece os cinco tipos atuais por meio da taxonomia compartilhada. O contrato persistido usa `event_type` textual, e o adaptador faz a conversão para `kind`; não será criada uma coluna `event_kind`.
- As cinco fotografias foram localizadas nos anexos, na sequência informada. Ainda não houve alteração no código ou nos cadastros.

## 1. CCPF selecionável e composição compartilhada
- Cadastrar uma única unidade institucional **CCPF — Conselho Consultivo Permanente Fenasoja**, no mesmo cadastro consumido pela Agenda, após repetir a busca por nome, sigla e aliases no momento da aplicação. Reutilizar qualquer registro equivalente encontrado, sem duplicá-lo.
- Vincular as três identidades que atualmente compõem o conselho no Ecossistema e Milton Racho, usando os usuários existentes e os controles de unicidade do cadastro. Preservar outros vínculos legítimos caso sejam encontrados durante a reconciliação.
- Fazer a Agenda e o nó raiz do Ecossistema consumirem os vínculos institucionais ativos dessa unidade. Excluir expressamente essa unidade da construção das comissões inferiores e da geração de novos portais: o nó CCPF existente continuará único e na mesma posição hierárquica.
- Oferecer busca por sigla e nome completo no seletor atual e mostrar seus integrantes por vínculo institucional, sem incluir outros administradores, gestores ou integrantes da Comissão Central. Preservar responsáveis já gravados nos eventos.
- Não alterar cargos, contas, capacidades ou permissões. A mudança será transacional e idempotente, com registro do antes/depois e interrupção em caso de identidade ambígua ou conflito.

## 2. Entrevista e Podcast de ponta a ponta
- Acrescentar **Entrevista** e **Podcast** às opções existentes e aos locais pertinentes que exibem ou filtram o tipo, mantendo os cinco tipos atuais.
- Implementar os mapeamentos `interview ↔ entrevista` e `podcast ↔ podcast` na criação, edição e leitura persistida. Conferir os consumidores de `event_type`, incluindo adaptadores e integrações, sem alterar categoria temática ou fonte do evento.
- Ampliar a sugestão automática com regras de intenção, não apenas ocorrência de palavras: “Reunião para organizar um podcast” permanece Reunião. A seleção manual de tipo e categoria continua prevalecendo.
- Garantir que uma leitura posterior não transforme Entrevista ou Podcast em Evento, inclusive quando existirem nomes de comissão ou textos que sugiram reunião.

## 3. Cinco fotografias, uma associação compartilhada
- Associar os anexos fornecidos aos cinco IDs confirmados; manter aliases oficiais apenas como compatibilidade e não usar nomes parciais para identificar novas associações.
- Preservar cada original e produzir versões otimizadas, sem gerar imagens ou alterar rostos. Remover somente bordas externas e ajustar o enquadramento individual para círculos e quadrados, sem cortar rosto ou topo da cabeça.
- Armazenar os arquivos pelo fluxo de recursos do projeto, com endereços estáveis, e atualizar `personPhotos.ts` e a apresentação otimizada existente, evitando uma associação independente por módulo.
- Uniformizar a prioridade para que estas fotografias institucionais expressamente escolhidas prevaleçam nos dois contextos; preservar fotografias cadastradas para outras pessoas e fallback de iniciais quando necessário.
- Manter dimensões estáveis, carregamento adequado e recuperação do fallback quando uma imagem falhar. Não apresentar os retratos pequenos como imagens de alta resolução.

## 4. Validação e entrega
- Testar busca por “CCPF” e pelo nome completo, integrantes corretos incluindo Milton, ausência de segundo nó CCPF, repetição da configuração e preservação das demais unidades e permissões.
- Testar conversão de ida e volta, categoria preservada, escolha manual, classificação por intenção e criação/edição/reabertura dos dois tipos em ambiente isolado ou transação revertida. Não criar eventos reais nem disparar notificações de teste em produção.
- Conferir Agenda, Comissão Central e Ecossistema no computador e celular, com as cinco fotos, nomes semelhantes, falha de imagem, recarga e outra sessão autorizada.
- Verificar as integrações existentes com Sala dos Voluntários, Restaurante e Google Agenda e executar os testes direcionados das áreas alteradas.
- Entregar uma relação de cadastros e associações utilizados, resultado dos testes e pendências específicas. Diferenciar código alterado, configuração aplicada ao banco e comportamento efetivamente conferido.
- **Não publicar sem pedido explícito.** A configuração do banco compartilhado e a disponibilização das alterações de interface serão reportadas separadamente.

## Detalhes técnicos
- Reutilizar `commissions`, `commission_responsibles`, `useOrgCommissions`, `useCronogramaRelationOptions` e o resolvedor organizacional; manter o cadastro institucional separado do catálogo que gera módulos e permissões.
- Atualizar os contratos `CronogramaKind`/`CronogramaEventType`, a taxonomia, `modelAdapter`, rótulos e consumidores pertinentes. Conferir validações efetivas antes de decidir se há necessidade de alteração estrutural no banco.
- Reutilizar a resolução de fotos por usuário, os componentes de avatar e `optimizedPortraitUrl`; corrigir divergências de prioridade somente nos caminhos relevantes.
- Invalidar as consultas de composição afetadas e conferir recarga independente, sem recarregar todo o sistema para trocar uma fotografia.
- Registrar as decisões estruturais em `AGENTS.md` durante a implementação e preservar as regras de segurança, concorrência e auditoria existentes.