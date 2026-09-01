# Reconstrução definitiva da via lateral, Rua Ubiretama e Portão 5

## Diagnóstico confirmado

- A estrada escura marcada no anexo como **“Essa rua aqui não existe”** continua aparecendo por duas fontes: os segmentos procedurais `brasilia-north-junction` / `brasilia-junction-south` e a superfície cadastral `RUA-BRASILIA`, que hoje não está na lista de superfícies substituídas.
- A Rua Ubiretama atual foi ligada a esse eixo incorreto e segue quase reta até um ponto separado do acesso ao Portão 5; portanto não reproduz o encontro lateral nem a curva dentro dos estacionamentos mostrados no anexo.
- O acesso físico do Portão 5 e o trevo da BR já têm infraestrutura própria, mas o nó de chegada da circulação interna está desconectado do traçado pedido.
- O campo já foi removido e substituído por piso pavimentado; essa correção será preservada.

## Resultado esperado

Uma única circulação contínua e coerente:

```text
conexão lateral junto à Arena
            │
            ╰── curva suave para dentro dos estacionamentos
                         │
Rua Ubiretama ───────────┼── via principal corrigida
                         │
                         ╰── curva de saída → Portão 5 → BR-472
```

A faixa reta antiga que atravessa o bosque/estacionamentos desaparecerá integralmente, sem faixa residual, recorte vazio, árvores flutuantes ou duplicação de asfalto.

## Implementação

### 1. Remover completamente a estrada errada

- Excluir da rede gerada os dois segmentos `brasilia-*` que reproduzem o eixo vertical antigo.
- Suprimir somente a **apresentação visual posterior** da superfície cadastral `RUA-BRASILIA`, preservando sua entidade oficial, nome, busca, seleção e metadados.
- Remover os nós, labels, footprints, acostamentos e interseções que dependem do corredor antigo.
- Fazer o pipeline de terreno deixar de recortar essa faixa, restaurando solo e vegetação onde a pista desaparecer.

### 2. Construir a via principal no corredor verde correto

- Criar um novo eixo independente a partir da conexão lateral ao lado da Arena, conforme o anexo.
- Conduzir a pista pelo lado correto do bosque e, depois do encontro com a Ubiretama, entrar nos estacionamentos com uma curva ampla e contínua — não uma reta central nem uma quina.
- Traçar a continuação por corredores de circulação entre as fileiras, permitindo contato apenas com as zonas de estacionamento realmente atravessadas pela via.
- Manter largura e acabamento compatíveis com as vias internas, usando tangentes e amostras suficientes para curvas lisas.

### 3. Reconectar corretamente a Rua Ubiretama

- Recalibrar a Ubiretama para chegar lateralmente e formar uma interseção real com a nova via principal no ponto mostrado no anexo.
- Criar uma junção compartilhada com eixos coincidentes, patch de asfalto único e mesma elevação, evitando gap, sobreposição e z-fighting.
- Atualizar a topologia para que busca, foco e roteamento reconheçam o caminho contínuo **Expo Rural → Rua Ubiretama → nova via → Portão 5**.

### 4. Curva pelos estacionamentos e posição do Portão 5

- Criar um nó específico de entrada nos estacionamentos e outro de aproximação ao portão, separando-os do antigo encontro leste.
- Fazer a nova via curvar por dentro da área de estacionamento e convergir suavemente para o acesso do Portão 5.
- Reposicionar a apresentação física do Portão 5 no centro da nova chegada e orientar sua abertura pela tangente final da pista.
- Preservar a entidade oficial `A5`; apenas sua posição/apresentação física e seu ponto de acesso serão calibrados.
- Manter a conexão com a BR como padrão de qualidade, ajustando somente a costura necessária para receber a nova chegada, sem recriar a rodovia nem duplicar rampas.

### 5. Integração espacial

- Recalcular recortes de terreno, corredores de exclusão de árvores, postes e bordas para o traçado novo.
- Ajustar somente as fileiras/zonas de estacionamento efetivamente ocupadas pela pista, preservando as demais vagas.
- Manter intactos Arena, pavilhões, quadras, praça e o piso pavimentado que substituiu o campo.

## Detalhes técnicos

- `rearSpatialCalibration.ts`: substituir os eixos antigos pelo eixo lateral curvo, interseção Ubiretama, trecho interno dos estacionamentos e aproximação final ao A5.
- `rearParkRoadNetwork.ts`: novos nós e segmentos, remoção dos `brasilia-*` antigos, substituição visual posterior de `RUA-BRASILIA`, grafo e âncoras atualizados.
- `rearRoadExclusions.ts`: permitir contato controlado da nova pista com estacionamento, sem liberar colisões com edificações ou infraestrutura elétrica.
- `rearParkEnvironment.ts` e integração de solo: regenerar árvores, postes e recortes a partir do novo footprint.
- Componente/apresentação do Portão 5: alinhar posição, rotação, foco e hit-test ao novo eixo de chegada.

## Validação obrigatória

- Teste de ausência total da pista antiga, inclusive da superfície cadastral visual no trecho posterior.
- Testes de continuidade e grau dos nós entre Ubiretama, nova via, Portão 5 e BR-472.
- Testes de colisão contra cada edificação, zona protegida, árvore e fileira de estacionamento não atravessada.
- Teste de restauração do terreno no corredor removido e de abertura do solo apenas sob a nova pista.
- Teste garantindo que o campo não reaparece e o piso pavimentado permanece.
- Validação visual via Playwright em vista superior e oblíqua: conexão lateral, cruzamento com Ubiretama, curva dentro dos estacionamentos e chegada ao Portão 5; desktop e mobile, sem erros de console.
