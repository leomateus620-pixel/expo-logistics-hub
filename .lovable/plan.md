# Conclusão das migrações oficiais dos pavilhões (4/5 e 5/5) — sem falhas

## Contexto verificado

- Histórico remoto: **74 migrações** aplicadas (1/5, 2/5 e 3/5 consolidadas; 4/5 falhou e fez rollback íntegro).
- B1 (Pavilhão 1) já está em `2026.4-p1.2` com 189 módulos. B4/B5 com 0 módulos internos. Baselines: 986 (Ind./Comércio/Serviços) e 949 (Exporural).
- A falha da 4/5 foi `PAVILIONS_8_13_OFFICIAL_INVENTORY_INVALID` — validação determinística dos dados temporários do próprio arquivo (linhas 433–505), independente do banco. Como os valores de referência fecham na matemática manual, a causa é desvio de transcrição no payload de 1.827 linhas, não defeito do arquivo.
- Arquivos íntegros no repositório (sha256 conferido): `20260825020000` (1.827 linhas) e `20260825030000` (1.529 linhas).

## Estratégia: pré-voo offline + transmissão byte-a-byte

### 1. Pré-voo offline da 4/5 (sem tocar no banco)
Script Python local que extrai os blocos `VALUES`/specs do arquivo e avalia **todas** as condições do gate `OFFICIAL_INVENTORY_INVALID`:
- 217 células totais; 114 (B4) + 103 (B5) por pavilhão;
- anéis normalizados dentro de [0,1], ≥5 pontos, render_parts ≥1;
- soma das áreas de referência das sequências = `modular_area_sqm` (438,50 / 351,30);
- soma das áreas geométricas (shoelace) × largura × profundidade = `modular_area_sqm` com tolerância 1e-8 (incluindo módulo L 24,50 m² e os 4 cantos poligonais de B5);
- 5 formas especiais e 3 espaços de apoio.
Resultado esperado: provar que o arquivo passa no próprio gate, isolando a falha anterior como desvio de transcrição.

### 2. Pré-voo offline da 5/5
Mesmo método para os gates `OFFICIAL_CELL_INVENTORY_INVALID` (438 células: B2=191, B7=63, B3=120), `MODULAR_AREA_INVALID` e `METRIC_FRAME_INVALID`, além de varredura estática anti-ambiguidade (padrão já usado nas anteriores).

### 3. Aplicar 4/5 byte-a-byte
Transmitir o conteúdo exato do arquivo `20260825020000` à ferramenta de migração (sem reescrever, resumir ou reordenar nada). Pós-condições verificadas por leitura:
- histórico 74 → 75;
- B4 = 114 e B5 = 103 `INTERNAL_STAND` na nova revisão de layout;
- entidades do segmento Ind./Comércio/Serviços 986 → 1200; baseline Exporural inalterado (949);
- contadores de `map_segments` consistentes.

### 4. Aplicar 5/5 byte-a-byte
Transmitir o conteúdo exato do arquivo `20260825030000`. Pós-condições:
- histórico 75 → 76;
- B2 = 191, B7 = 63, B3 = 120 módulos internos;
- entidades do segmento Exporural 949 → 1315;
- nenhuma entidade não-estrutural ou estado comercial alterado (gates internos do arquivo).

### 5. Revisão completa do Pavilhão 3 (B6) — entrega solicitada
- 214 módulos na revisão `2026.4-p3.3`, seções físicas/display, portões, vínculos entidade↔lote;
- geometrias válidas (áreas, bboxes, rotações) via consultas de leitura;
- paridade com o inventário oficial e com o RPC público do mapa (`get_public_commercial_map`).

### 6. Relatório final em PT-BR
Tabela por pavilhão (identificador, nome, módulos, revisão), totais por segmento antes/depois, estado do histórico (74 → 76) e resultado da auditoria do Pavilhão 3.

## Regra de segurança
Qualquer falha: parar imediatamente, verificar rollback (histórico e baselines), reportar o erro exato. Nenhuma escrita fora da ferramenta de migração; nenhuma alteração nos arquivos históricos.

## Detalhes técnicos
- Ferramentas: `supabase--migration` (aplicação) e `supabase--read_query` (verificações); script Python local apenas para simulação offline dos VALUES (numpy/shoelace, sem acesso ao banco).
- `psql` não será usado para os gates (role restrito bloqueia temp tables/funções); a simulação é 100% local.
- Nenhum arquivo de migração será criado, renomeado ou editado.
