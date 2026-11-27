# Validação local no navegador

O Chrome executou o Mapa Comercial com inventário sintético e a cartografia de referência. O fixture interceptou as respostas em localhost. As imagens mostram dados sintéticos e os o preço de configuração fornecido no escopo da tarefa.

| Cenário | Resultado em desktop, 1440 × 900 |
|---|---|
| Modo padrão | O clique na área iniciou a roda-gigante, escureceu a cena e reenquadrou a câmera. A animação retornou após sair de Vendas e clicar na área novamente. |
| Modo Vendas | O primeiro clique na área abriu a ficha com a câmera e o ângulo da roda-gigante estáveis. O primeiro clique no marcador da estrutura abriu a mesma ficha. |
| Carrinho | Um espaço de R$ 252.280,00, com os três pontos listados como incluídos. |
| Pontos vinculados | O marcador de GAST-J-02 encaminhou à ficha do parque em Vendas. No modo padrão, os três pontos exibiram o selo de inclusão e a situação da unidade principal. |
| Balão | O ponto independente permaneceu selecionável, com ação para adicionar à venda. |

[Modo padrão no desktop](evidence/desktop-modo-padrao.jpg) · [Modo Vendas no desktop](evidence/desktop-modo-vendas.jpg)

## Celular, 412 × 860

O primeiro toque na área abriu a ficha nos dois modos. Em Vendas, a posição da câmera e o ângulo da roda-gigante permaneceram estáveis. O primeiro toque no marcador da estrutura abriu a ficha. A apresentação mostrou o preço e a ação de venda já no resumo inicial. A gaveta do carrinho mostrou um espaço de R$ 252.280,00 e seus três pontos incluídos. O toque nos marcadores dos pontos vinculados e o de Balão foram verificados em desktop.

[Modo Vendas no celular](evidence/celular-modo-vendas.jpg) · [Carrinho no celular](evidence/celular-carrinho.jpg)

Os testes de persistência, assinatura, privacidade do objeto e projeção financeira estão no [registro do banco local](database-qa.md). A execução no navegador verificou a interface com dados sintéticos. A homologação hospedada, a conciliação em produção e a abertura do PDF original ainda dependem do ambiente autorizado.
