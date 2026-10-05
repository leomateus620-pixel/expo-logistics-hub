# Edição clara e confiável dos lotes de uma venda

## Objetivo
Corrigir a busca e seleção de novos lotes e refazer a janela **Editar lotes da venda** no estilo escolhido, com ações claras para adicionar, retirar e desfazer. A justificativa deixa de ser uma etapa obrigatória.

## Diagnóstico confirmado
- Na lateral do mapa, `SaleLotsEditAction` procura lotes na chave de cache `commercial-map/reference`, que contém apenas a referência visual do mapa, não o inventário comercial. Por isso a janela recebe `lots=[]`, exibe “Fora do inventário carregado” e nenhuma busca encontra resultados.
- O inventário real está nas consultas `commercial-map/full` ou `commercial-map/commission`. No banco, o projeto possui 1.472 lotes ativos; existem várias opções 44 e 64 disponíveis, inclusive no Pavilhão 13.
- Na Dashboard, a janela já recebe os dados reais do mapa; o defeito é específico da abertura pela lateral.
- A justificativa é exigida hoje em três pontos: janela, serviço e função transacional. O histórico também armazena um texto obrigatório.

## Implementação

### 1. Fonte correta do inventário
- Fazer a lateral receber diretamente os `lots` e `entities` do mapa já carregado, seguindo o mesmo padrão confiável da Dashboard, sem tentar adivinhar chaves internas do cache.
- Garantir que Dashboard e lateral usem a mesma lista do projeto e o mesmo resolvedor de pavilhão/quadra.
- Manter a validação final no servidor: somente lote ativo, do mesmo projeto, disponível e com preço oficial pode ser adicionado.
- Mostrar carregamento ou falha do inventário de forma explícita, em vez de concluir incorretamente que não existem resultados.

### 2. Busca e seleção de novos lotes
- Derivar o escopo da venda pela hierarquia persistida dos lotes ativos: dentro de pavilhão, usar o `parentEntityId` exato; em áreas externas, usar o `segmentId` persistido. A busca nunca será global.
- Mostrar no cabeçalho da busca onde o novo lote será procurado, por exemplo **Pavilhão 13 — Comércio**, sem oferecer pavilhões ou áreas diferentes.
- Se uma venda histórica reunir mais de um pavilhão/segmento, exigir primeiro a escolha entre os locais já presentes naquela venda; ainda assim, nunca misturar resultados de locais diferentes na mesma lista.
- Buscar por número, código e nome dentro desse escopo, com normalização de maiúsculas, acentos e espaços.
- Exibir resultados em cartões com identificação completa, localização, valor da etapa e situação comercial: **Disponível**, **Venda em aberto**, **Vendido** ou **Bloqueado**.
- Ordenar primeiro os lotes disponíveis e depois por número. Os demais aparecem para consulta e entendimento, mas ficam desabilitados com o motivo pelo qual não podem ser adicionados.
- Usar botão textual **Adicionar** e manter os lotes escolhidos em uma área visível de “Adicionados nesta alteração”, com ação **Desfazer**.
- Excluir da lista de candidatos os lotes que já pertencem à venda, evitando seleção duplicada.

### 3. Retirada sem ambiguidade
- Separar “Lotes atuais da venda” de “Adicionar lotes”.
- Substituir o sinal “−” isolado por botão rotulado **Retirar**.
- Ao retirar, manter o cartão visível com estado “Será retirado” e botão **Manter**, sem apagar imediatamente da tela.
- Destacar claramente os grupos **Entram** e **Saem** no resumo antes de salvar.

### 4. Janela no estilo escolhido
Aplicar a direção **Modal com cartões funcionais**:
- cabeçalho enxuto, lista atual em cartões e área de busca visualmente separada;
- ações rotuladas e estados distintos para mantido, adicionado e retirado;
- valores e parcelas em uma segunda seção;
- rodapé fixo com quantidade final, total recalculado, Cancelar e Salvar alterações;
- adaptação para celular sem cortar textos, botões ou resultados e sem esconder o item focado pelo teclado.

### 5. Justificativa opcional, sem perder auditoria
- Remover a seção numerada “03 Motivo” e todos os bloqueios que impedem salvar sem texto manual.
- Manter uma opção discreta **Adicionar observação (opcional)**, recolhida por padrão.
- Quando ficar vazia, gerar automaticamente uma descrição objetiva a partir da alteração, por exemplo: “Adicionados: B5-M064; retirados: B5-M068”.
- Preservar o campo obrigatório do histórico no banco e a função transacional atual; assim não é necessária migração de estrutura nem se perde rastreabilidade.

### 6. Persistência e sincronização
- Preservar a operação única e transacional, trava contra edição simultânea, recálculo de total/parcelas abertas, parcelas pagas, contratos, estados comerciais e histórico individual dos lotes.
- Após salvar, atualizar mapa, Dashboard, inspeção da venda, detalhes, histórico e carrinho exatamente como hoje.
- Em conflito de disponibilidade ou edição simultânea, manter tudo inalterado e recarregar os dados atuais para nova escolha.

## Arquivos previstos
- `src/features/commercial-map/dashboard/salesOrders/ReviseSaleOrderDialog.tsx`
- `src/features/commercial-map/dashboard/salesOrders/SaleLotsEditAction.tsx`
- `src/features/commercial-map/dashboard/salesOrders/salesOrdersService.ts`
- `src/features/commercial-map/dashboard/salesOrders/revise-sale-order.css`
- ponto de composição da lateral que já possui os dados carregados do mapa
- novos testes focados da janela, busca e origem do inventário

Não é prevista migração de banco: a observação vazia será substituída por um resumo automático antes da chamada segura existente.

## Validação
- Abrir pela lateral do Módulo 68 e confirmar a identificação correta dos módulos 68–72.
- Pesquisar “64”, “44” e código completo; confirmar que a venda Êxito mostra somente resultados do Pavilhão 13 e nunca módulos homônimos de outros pavilhões.
- Conferir os quatro estados nos resultados e garantir que apenas **Disponível** tenha a ação **Adicionar**.
- Adicionar, desfazer adição, retirar e manter novamente um lote.
- Salvar sem observação manual e verificar histórico automático da venda e de cada lote.
- Conferir recálculo, parcelas pagas preservadas, atualização imediata das cores e bloqueio de lote já ocupado.
- Testar a mesma venda pela Dashboard e pela lateral em desktop e celular.
- Rodar testes focados, verificação de tipos e confirmar o build final.

## Fora do escopo
- Nenhuma alteração em vendas reais, preços oficiais, geometrias, permissões ou publicação.
