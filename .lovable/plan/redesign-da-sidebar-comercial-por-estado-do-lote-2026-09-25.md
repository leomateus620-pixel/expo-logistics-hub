# Redesign da sidebar comercial por estado do lote

## Objetivo
Transformar a lateral direita em dois painéis comerciais distintos:

- **Vendido:** responde primeiro quem comprou, quando, em qual etapa e quem registrou a venda.
- **Disponível:** prioriza identificação, localização, metragem, disponibilidade e preços oficiais.

A identidade visual atual do Mapa Comercial será preservada, com menos caixas, melhor hierarquia e uso mais eficiente da altura no desktop e no celular.

## Implementação

### 1. Organizar os dados canônicos da venda
- Ampliar a consulta existente do histórico da venda para retornar, a partir das tabelas atuais, comprador, data/hora do registro, etapa, responsável, contrato, valor, forma de pagamento e parcelas.
- Usar a venda confirmada ligada ao lote e ao pedido; não criar campo, tabela ou cópia de comprador/vendedor.
- Tratar a hora pelo `created_at` da operação, pois `sale_date` guarda somente a data civil.
- Manter o cache no namespace `commercial-map`, aproveitando a invalidação já executada após a confirmação da venda para trocar imediatamente `AVAILABLE → SOLD` sem F5.

### 2. Composição para lote vendido
- Inserir logo após o cabeçalho um resumo compacto de **Venda confirmada**, com:
  - comprador em destaque;
  - data e hora em formato brasileiro e fuso de Brasília;
  - etapa registrada;
  - responsável pela venda;
  - contrato, somente quando existir.
- Não repetir esses dados em blocos genéricos de expositor/reserva.
- Manter status Vendido, metragem oficial e identidade do lote imediatamente visíveis.

### 3. Composição para lote disponível
- Criar uma visão geral própria, sem espaços vazios de venda.
- Priorizar lote/quadra, segmento, área oficial, status, Renovação, 2ª Etapa, preço por m² e características comerciais efetivamente informadas.
- Preservar as ações comerciais legítimas do fluxo de Vendas, conforme permissões, sem misturá-las às ferramentas técnicas removidas.

### 4. Valores oficiais com etapa confirmada
- Permitir que o painel de Valores Oficiais 2028 receba a etapa canônica da venda.
- Marcar somente o card correspondente com **✓ Confirmado**, borda e destaque sutis.
- Manter o outro card como referência, sem aparência de segunda venda.
- Não inferir etapa comparando preços.

### 5. Histórico comercial rastreável
- Apresentar a venda como evento principal na aba Histórico: data, hora, comprador, etapa e responsável.
- Integrar esse evento com as demais atividades em ordem cronológica decrescente, preservando o histórico auditável existente.
- Manter parcelas e vencimentos acessíveis no resumo da venda, sem perder a rastreabilidade já implementada.

### 6. Contrato compacto e acionável
- Substituir o bloco permanente de documentos por uma seção **Contrato da venda**.
- Sem contrato: mostrar descrição curta e **+ Anexar contrato** somente a quem possui permissão.
- Com contrato: mostrar **Contrato anexado ✓**, arquivo ativo e ações **Visualizar** e **Substituir** conforme permissão.
- Ocultar completamente mensagens vazias como “Nenhum contrato anexado a este lote”.

### 7. Remover ruído somente desta sidebar
Remover da experiência comercial lateral:
- Centralizar;
- Verificar entidade;
- Editar lote;
- Editar geometria;
- Área calculada / Sem calibração;
- Preço solicitado / A negociar;
- o bloco vazio de documentos privados.

As funções compartilhadas não serão apagadas: controles técnicos que continuam válidos em ferramentas administrativas, barra do mapa, diálogos ou outros contextos permanecerão intactos.

### 8. Refinamento visual e responsivo
- Reduzir caixas aninhadas e usar agrupamentos, divisores e tipografia semântica.
- Dar destaque comercial discreto ao estado vendido e ao comprador, preservando verde, dourado e vermelho já usados pelo mapa.
- Ajustar nomes longos, rolagem, alvos de toque e estados compacto/expandido no painel inferior móvel.
- Aplicar a mesma lógica aos lotes externos e aos módulos internos que usam a ficha comercial, sem alterar geometria, seleção ou câmera.

## Validação
- Testar `SOLD` com comprador, data/hora, etapa, responsável e contrato; e ausência segura de campos opcionais.
- Testar `AVAILABLE` sem qualquer bloco vazio de venda/contrato.
- Confirmar que somente a etapa registrada recebe **✓ Confirmado**.
- Confirmar histórico em ordem cronológica e horário de Brasília.
- Confirmar atualização imediata após venda e após anexar/substituir contrato.
- Confirmar permissões de visualização e gestão de contratos.
- Atualizar os testes que hoje esperam ações técnicas dentro da sidebar, assegurando que elas continuem disponíveis nos contextos administrativos legítimos.
- Validar desktop e celular, além dos testes focais, tipos e build.

## Limites
- Nenhuma nova tabela, migração ou fonte de verdade.
- Nenhuma alteração em preços, venda atômica, parcelas, permissões, URLs, geometria ou links públicos.
- Nenhuma publicação em produção.
