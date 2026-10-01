# Melhoria da ficha lateral dos módulos dos pavilhões

## Resultado esperado
- Dar prioridade à situação comercial: venda em aberto ou confirmada, comprador, etapa, data, total e ações permitidas aparecem com leitura clara antes dos detalhes secundários.
- Garantir que “Confirmar contrato assinado” e “Cancelar venda em aberto” apareçam completos e sejam fáceis de tocar, sem mudar a exigência de confirmação ou as permissões existentes.
- Organizar localização, área, valores oficiais, histórico e contrato em blocos legíveis, sem colunas estreitas, textos cortados nem repetição desnecessária.
- Adaptar a ficha tanto à lateral do computador quanto à folha inferior no celular, inclusive com nomes e valores longos; manter a legenda do pavilhão acessível.

## Implementação
1. Reorganizar a ficha do módulo, mantendo a identidade e situação visíveis e os dados da venda em primeiro plano. Deixar informações técnicas e preços abaixo, com hierarquia apropriada para vendas abertas e concluídas.
2. Ajustar o layout da lateral e do painel móvel: largura e rolagem utilizáveis, linhas de preço ocupando a largura disponível, botões de ação completos e espaçamento seguro. Preservar a aparência atual do mapa e os controles de usuários sem permissão comercial.
3. Conferir as mesmas regras de encaixe nas fichas de consulta pública quando compartilharem estilos, sem mostrar ações ou dados privados nesses links.
4. Adicionar testes focados para as variações de acesso e de situação comercial; conferir em telas estreitas e largas que os controles, números e textos não fiquem truncados.

## Detalhes técnicos
- A ficha interna usa `PavilionModuleCard`, com `SaleOpenSection`, `LotPricing2028Panel` e a lateral `CommercialMapDock`. Hoje o `dl` interno mantém duas colunas de largura limitada, e o painel de preços usa duas colunas dependentes da largura da janela, não da lateral; os botões da venda também dividem a mesma faixa estreita.
- Alterações limitadas à apresentação e testes; sem mudanças em dados, metragens, cálculos, estados de venda, autorizações, geometria ou endereços. Não publicar.
