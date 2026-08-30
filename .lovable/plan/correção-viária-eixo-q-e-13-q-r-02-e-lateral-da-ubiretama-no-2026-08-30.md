# Correção viária: eixo Q-E-13 → Q-R-02 e lateral da Ubiretama no Q-R-55

## O que foi verificado

- A laje ao lado do Espaço Mirante é a entidade `PRACA-ACESSO-EXPORURAL` (x 8,95→13,92 / z -11,59→-7,66), publicada tanto no banco (revisão 2026.4, ativa) quanto em `officialReference2026.ts`. É ela que aparece como bloco quadrado de asfalto no anexo 1.
- O eixo pedido de fato existe como `RUA-BRASILIA` (x 12,87→13,92 / z -11,67→26,95), mas seu trecho sul está encoberto pela laje da praça, o que quebra a leitura de "rua" naquele ponto. A `RUA-PASTOR-ALBERT-LEHENBAUER` começa em z -11,56, ou seja, há encosto real entre as duas.
- Na Exporural, a `RUA-UBIRETAMA` tem uma perna leste em x 57,08→57,99, mas a `RODOVIA-RS-472` ocupa x 56,40→60,00 na mesma faixa e cobre visualmente esse trecho. Resultado: ao lado do `Q-R-55` (x 54,33→57,05 / z -26,44→-20,55) não se lê nenhuma rua, como no anexo 2.

## O que será feito

### 1. Eixo Q-E-13 → Q-R-02 (lado leste das Quadras E/F/G)

- Remover integralmente a praça de asfalto ao lado do Mirante: arquivamento reversível no banco e exclusão da lista de referência estática. A base abaixo volta a ser grama padrão, sem rótulo, sem área clicável e sem resíduo de mesh.
- Publicar a rua correta no mesmo eixo, com largura padrão das vias oficiais, ligando a lateral do `Q-E-13` (z ≈ 6,3) até o encontro com a Rua Pastor Albert Lehenbauer, ao lado do `Q-R-02` (z ≈ -11,6), garantindo continuidade sem costura com a Rua Brasília existente.
- Garantir os cruzamentos reais com Rua Brasil, Rua Chile, Rua Bolívia e Rua Paraguai (todas terminam em x 12,98, portanto encostam no eixo) e com a Lehenbauer na ponta sul, usando o detector de interseções já existente.
- Preservar o Espaço Mirante, a Via Expressa, a Alameda Gastronômica e todos os lotes: nenhuma geometria comercial é reduzida ou deslocada.

### 2. Rua Ubiretama ao lado do Q-R-55

- Criar o trecho lateral que falta entre a Rua Johan Muller / Rua Leste da Exporural e a Rua Gustavo Bessel, passando rente ao lado leste do `Q-R-55` (faixa livre entre x 57,05 e a rodovia, z -26,47 → -19,53), fechando a conexão com a rua da frente.
- Corrigir a causa estrutural da invisibilidade: a sobreposição com a RS-472 será tratada por recorte/prioridade de superfície, para que o asfalto da Ubiretama seja lido em todos os ângulos em vez de ficar enterrado sob o plano da rodovia.
- Sem invasão de lote: a faixa usa apenas o vão já reservado entre o `Q-R-55` e a rodovia.

## Detalhes técnicos

- Migration versionada: arquiva `PRACA-ACESSO-EXPORURAL` (`is_archived = true`, `verification_status = 'ARCHIVED'`, metadata de reversão) e insere/atualiza as novas vias em `map_entities` + `map_entity_geometries` (`is_current = true`), camada `circulation`, classificação `ROAD`, elevação 0, extrusão 0,032, idempotente por `public_identifier`.
- `src/features/commercial-map/data/officialReference2026.ts`: remoção da praça e inclusão dos novos trechos no mesmo padrão de retângulo em coordenadas locais.
- Geometria e material herdados do pipeline `buildRoadNetworkGeometries` (asfalto, sarjeta, meio-fio, fusão de interseções), sem novos draw calls por rua e dentro do orçamento atual.
- Testes: atualizar `src/test/commercialMapRoadInfrastructure.test.ts` (novo inventário, cobertura dos dois pontos reclamados, não invasão de lotes) e a suíte de limpeza para refletir a praça removida.
- Validação visual obrigatória desktop e mobile, em vista superior, isométrica e aproximada, nos dois pontos dos anexos.
