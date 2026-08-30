# Correção definitiva da Rua Brasília no eixo Quadra E → Q-R-02

## Diagnóstico confirmado

- A geometria persistida de `RUA-BRASILIA` está correta e contínua no banco: ocupa o eixo x `12,87 → 13,92`, de z `-11,67 → 26,95`, cruzando as ruas transversais e passando pela lateral da Quadra E, em frente à Alameda Gastronômica, ao lado da Via Expressa e em frente ao Espaço Mirante.
- Porém, no mapa geral, `CommercialMapCanvas` remove **toda** a entidade oficial `RUA-BRASILIA` porque ela consta em `REPLACED_OFFICIAL_ROAD_IDENTIFIERS`.
- A superfície substituta de `RearParkRoadNetwork` começa apenas no setor traseiro/sul da planta (primeiro ponto em PDF `[3964, 3950]`) e não reconstrói o intervalo da Quadra E ao Q-R-02. Assim, o cadastro existe, os testes de cobertura baseados nos dados passam, mas a superfície efetivamente renderizada fica ausente — exatamente como mostra o anexo.
- A antiga laje `PRACA-ACESSO-EXPORURAL` está corretamente arquivada e não deve voltar.

## Implementação

### 1. Separar a via oficial da continuação traseira

- Deixar de excluir globalmente `RUA-BRASILIA` da infraestrutura viária oficial.
- Renderizar sua geometria oficial no trecho interno, preservando o eixo contínuo:
  - lateral da Quadra E / Q-E-13;
  - frente da Alameda Gastronômica;
  - lateral da Via Expressa;
  - cruzamentos com Rua Brasil, Rua Chile, Rua Bolívia e Rua Paraguai;
  - frente do Espaço Mirante;
  - encontro com Rua Pastor Albert Lehenbauer, junto ao Q-R-02.
- Limitar a substituição procedural somente ao trecho traseiro realmente recalibrado, com uma pequena sobreposição controlada na costura. Isso evita tanto o desaparecimento atual quanto duas superfícies concorrentes para a mesma rua.

### 2. Garantir continuidade visual e topológica

- Manter asfalto, altura, sarjeta, meio-fio e material no pipeline viário compartilhado.
- Abrir corretamente os meios-fios em todos os encontros transversais, reutilizando o detector de interseções existente.
- Preservar Alameda Gastronômica, Via Expressa, Espaço Mirante, lotes e estruturas permanentes; nenhuma geometria comercial será deslocada ou reduzida.
- Manter a praça removida como arquivada, deixando somente a faixa viária de largura padrão em frente ao Mirante.

### 3. Persistência e coerência das fontes

- Ajustar a referência cartográfica e a regra de apresentação procedural para que banco, fallback estático e renderer descrevam o mesmo eixo.
- Aplicar migration idempotente apenas se a divisão geométrica persistida for necessária; não duplicar `RUA-BRASILIA` nem criar uma segunda identidade pesquisável.
- Preservar seleção, busca, filtros, labels e foco de câmera sob a entidade canônica `RUA-BRASILIA`.

## Validação

- Adicionar teste sobre o conjunto **realmente renderizado**, não apenas sobre `OFFICIAL_REFERENCE_DATA`, cobrindo amostras ao lado da Quadra E, Alameda, Via Expressa, Mirante e Q-R-02.
- Verificar conexões topológicas com as quatro ruas transversais e com Rua Pastor Albert Lehenbauer.
- Confirmar ausência de colisão com lotes e ausência da antiga laje de acesso.
- Executar testes viários focados e verificação TypeScript.
- Validar visualmente no mapa ao vivo em desktop e mobile, nas vistas superior, isométrica e aproximada do mesmo ângulo do anexo, além de conferir erros no console.