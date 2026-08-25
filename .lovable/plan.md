# Retomada das migrações dos Pavilhões — correção da 3/5 e conclusão da sequência

## Contexto validado

- Migrações 1/5 (`20260825101138`) e 2/5 (`20260824210000`, com correção autorizada de ambiguidade) já aplicadas. Histórico remoto: 73 versões.
- Migração 3/5 (`20260825010000_correct_pavilion_1_axis_projection.sql`) falhou em `PAVILION_1_AXIS_FINAL_STATE_INVALID`. Rollback íntegro: B1 com 189 módulos em `2026.4-p1.1`.
- Causa raiz confirmada: coluna `map_entity_geometries.rotation` é `numeric(14,6)`; a migração 3/5 estagia `(pi()/2)::numeric` sem arredondamento (linha 187), e a validação final compara `rotation IS DISTINCT FROM staged.facing_radians` → sempre diverge. Defeito latente de arquivo.
- Varredura preventiva: 4/5 usa `round(pi()::numeric, 6)` (limpa); 5/5 tem `pi()/2` sem round apenas em guard de UPDATE, sem validação final de rotação (não bloqueia — permanece byte-a-byte).

## Execução

1. **Correção mínima (1 linha) em `20260825010000`**, linha 187:
   - `(pi() / 2)::numeric AS facing_radians` → `round((pi() / 2)::numeric, 6) AS facing_radians`
   - Padrão idêntico ao usado pelo próprio autor na migração 2/5 (linha 213). `cos`/`sin` (linhas 188–189) alimentam apenas jsonb — sem alteração.
2. **Aplicar migração 3/5 corrigida** via ferramenta de migração (runner transacional nativo). Em caso de novo RAISE EXCEPTION: parar, confirmar rollback e reportar erro exato, sem correção automática adicional.
3. **Aplicar migrações 4/5 (`20260825020000`) e 5/5 (`20260825030000`) byte-a-byte**, na ordem cronológica, com gate estático de ambiguidade antes de cada uma.
4. **Validação final**:
   - Histórico = 76 versões; inventário de entidades por pavilhão (total esperado 1.315).
   - Revisão profunda do Pavilhão 3 (B6): contagem de módulos (214), `layoutRevision = 2026.4-p3.3`, integridade de geometrias correntes, vínculos de lotes e metadata.
   - Relatório final em PT-BR.

## Detalhes técnicos

- Nenhuma outra linha dos artefatos será alterada; 4/5 e 5/5 permanecem byte-a-byte.
- Cada aplicação ocorre em transação única (BEGIN…COMMIT do próprio artefato) com advisory lock — falha implica rollback completo.
- Nenhuma alteração de código frontend neste plano.
