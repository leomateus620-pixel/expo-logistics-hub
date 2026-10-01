# Reorganização oficial do Pavilhão 13

## Resultado esperado
Atualizar somente o interior comercial do Pavilhão 13 conforme o PDF anexado, preservando a orientação, os corredores, acessos, câmera e funcionamento atual do mapa.

A nova referência ficará com:
- 104 boxes numerados de 01 a 104, sem duplicidades ou lacunas;
- 345,00 m² de área comercial total;
- boxes 79 e 26 com 9,00 m²;
- boxes 80 e 25 com 13,50 m²;
- demais 100 boxes com 3,00 m²;
- os três quadrados 27, 28 e 29 removidos da faixa superior e esses números reposicionados no início da ilha central, como mostra o PDF.

## Implementação
1. **Atualizar a referência única da planta**
   - Manter as fileiras laterais e a aparência existente, alterando apenas a sequência dos números, as quatro áreas especiais e as posições estritamente necessárias.
   - Organizar as sequências oficiais:
     - direita inferior: 01–15;
     - direita superior: 16–24, com 25 e 26 especiais;
     - ilha central: primeira coluna 78→53 e segunda coluna 27→52;
     - esquerda superior: 79 e 80 especiais, seguidos de 81–89;
     - esquerda inferior: 90–104.
   - Remover as três células superiores atualmente ocupadas por 27–29, sem alterar corredores, acessos ou estruturas.

2. **Aplicar uma migração segura e idempotente**
   - Preservar os IDs dos 103 registros atuais, seus status, histórico e vínculos de preço.
   - Reposicionar os registros existentes pela identidade técnica; criar somente o novo registro 104.
   - Atualizar geometrias, âncoras, números exibidos, áreas oficiais, metadados da revisão e totais do Pavilhão 13.
   - Criar para o box 104 a mesma configuração comercial vigente no pavilhão, sem inventar preço.
   - Incluir validações que interrompem a operação caso surja atividade comercial antes da aplicação. A auditoria atual encontrou todos os 103 lotes como `Disponível` e nenhum vínculo de venda, reserva, negociação, contrato ou item de pedido.

3. **Propagar pela fonte cadastral existente**
   - Fazer Modo Vendas, ficha do lote, busca, listas, dashboard, mini mapa e link público do Pavilhão 13 consumirem os 104 registros e as novas áreas sem lógica paralela.
   - Preservar as cores, estados, permissões, rotas públicas e regras financeiras atuais.

4. **Atualizar as validações automatizadas**
   - Conferir inventário 01–104, ausência de lacunas/duplicidades, soma de 345,00 m² e as quatro áreas especiais.
   - Validar a sequência e o sentido de cada fileira, a ausência das células 27–29 no topo e sua presença na ilha.
   - Garantir que nenhum outro pavilhão seja alterado e que IDs/status/histórico dos 103 lotes sejam preservados.

5. **Validar visualmente e ponta a ponta**
   - Comparar a planta renderizada lado a lado com o PDF em desktop e celular.
   - Conferir seleção dos boxes 25, 26, 27, 28, 29, 78, 79, 80, 103 e 104.
   - Verificar atualização após recarregar no mapa, Modo Vendas e link público, sem registrar venda real de teste.
   - Executar testes relacionados, verificação de tipos e compilação.

## Limites
- Nenhuma mudança nos demais pavilhões, no mapa externo, nas rotas, nas cores comerciais ou nas regras de venda.
- Nenhuma publicação em produção.
