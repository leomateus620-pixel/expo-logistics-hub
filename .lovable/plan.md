# Progresso das vendas no Dashboard Comercial

## Resultado na tela
- Adicionar uma faixa horizontal logo abaixo dos três indicadores financeiros, ocupando a largura disponível sem esconder o total comercial. A faixa terá trilho discreto, trecho azul luminoso para vendas confirmadas e trecho amarelo para vendas em andamento, além do percentual combinado em destaque e uma legenda compacta com os dois percentuais separados.
- Posicionar o Sojinha em versão leve, bidimensional e fiel ao personagem já presente no projeto, acima da extremidade do progresso combinado. Ele corre com movimento ágil das pernas; quando o percentual muda, acompanha suavemente a nova posição. A corrida não altera nem simula os números. Reservar espaço próprio acima do trilho para que personagem, valores e demais indicadores não se sobreponham, inclusive no celular.
- A aparência acompanhará a matriz financeira atual (azul, amarelo, fundo claro e tipografia existente), com brilho contido no azul e leitura clara também quando o progresso for muito pequeno ou chegar a 100%. Não reutilizar a imagem de referência da tela como conteúdo.

## Regras do indicador
- Medir **valor comercial**, conforme escolhido: azul = valor negociado das vendas confirmadas ÷ valor comercial total conhecido; amarelo = valor negociado das vendas em andamento ÷ o mesmo total. A porcentagem principal é a soma dos dois; os trechos são adjacentes, sem contar uma venda duas vezes. Exibir 1 casa decimal, mas dimensionar pelos valores não arredondados para evitar discrepâncias visuais.
- Usar os mesmos valores já mostrados nos três indicadores e a mesma seleção de tabela para lotes sem venda (Renovação/2ª Etapa). Assim, novas vendas, confirmações, cancelamentos, mudanças de preço e sincronizações do mapa recalculam a faixa automaticamente sem gravar outro dado.
- Respeitar valores ausentes ou ambíguos: não inventar preço para venda sem valor, não tratar falta de dados como zero e não chamar venda de receita recebida. Quando a cobertura do total for parcial, identificar que é um subtotal conhecido; quando não houver total positivo, mostrar estado sem porcentagem em vez de divisão por zero. Limitar a extensão visual a 0–100% e manter precisão monetária em centavos nos cálculos.

## Detalhes técnicos e validação
- Criar um componente pequeno de progresso no módulo da Dashboard, usando os agregados existentes (`soldValue`, `saleOpenValue`, `totalKnownValue`, contagens de cobertura) e tokens de cor/sombra da matriz financeira. Não alterar vendas, contratos, banco, permissões ou mapa 3D.
- Ilustrar o Sojinha como elemento decorativo 2D, sem carregar Three.js na Dashboard; manter a porcentagem e a legenda disponíveis em texto para leitores de tela. A animação permanece ativa na apresentação normal; para pessoas que ativaram redução de movimento, oferecer a posição estática correspondente ao valor real, preservando acesso e legibilidade.
- Cobrir em testes as transições de status e atualização dos dados, 0%, valores parciais, total inexistente, trocas de tabela e limite de 100%; conferir a apresentação em larguras de celular e desktop sem colisões e sem barras ou números desconectados do total mostrado.

Não publicar sem pedido explícito e não criar vendas reais de teste.
