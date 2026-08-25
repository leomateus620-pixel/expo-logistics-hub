# Conclusão das migrações cartográficas 2026.4 — 5/5 + Auditoria Pavilhão 3

## Estado atual (verificado nesta sessão)

- Histórico remoto: **75 migrações** (4/5 aplicada com sucesso — B4=114, B5=103, total 217 módulos ativos).
- Arquivo corrigido `/tmp/final5.sql` (1.529 linhas) já contém as 2 correções validadas em pré-voo:
  1. Coordenadas normalizadas limitadas com `greatest(least(..., 1), 0)` (resíduo de ponto flutuante de −5e-21 nos módulos de canto B2);
  2. Alias `module_source_discrepancy` eliminando a ambiguidade de coluna na linha 722.
- **Reordenação do resolvedor NÃO é necessária na 5/5** (diferente da 4/5): o gatilho `set_map_entity_canonical_segment` só rejeita quando o resolvedor retorna NULL **e** o insert traz `segment_id` preenchido. A 5/5 insere B2-M (já conhecido pelo resolvedor vigente → `industria-comercio-servicos`) e B8/B10 com `segment_id` NULL → caminho seguro confirmado lendo o código-fonte do gatilho no banco.

## Passo 1 — Sincronizar repositório

- `cp /tmp/final5.sql supabase/migrations/20260825030000_rebuild_pavilions_5_7_and_14_official_layouts.sql` e conferir com `diff`.

## Passo 2 — Aplicar migração 5/5 (Pavilhões 14, 5 e 7)

- Transmitir o conteúdo integral e corrigido (byte-for-byte de `/tmp/final5.sql`) via ferramenta de migração.
- Portões internos da própria migração (já validados em pré-voo transacional):
  - Total de células = **438** (B2=186 Pavilhão 14, B8=81, B10=171);
  - Contagem por pavilhão = `module_count` da spec;
  - Áreas de cada fileira (runs) dentro da tolerância oficial;
  - Formas especiais (ex.: B8 módulo 28) preservadas.

## Passo 3 — Verificação pós-condição

- Histórico = **76** migrações; versão `20260825030000` presente.
- Contagens ativas (`INTERNAL_STAND`, não arquivados): B2=186, B8=81, B10=171.
- B2: 186 módulos com `segment_id` apontando para `industria-comercio-servicos` e metadata `segmentCode = INDUSTRIA_COMERCIO_SERVICOS`.
- B8/B10: módulos com `segment_id` NULL (fora dos portais comerciais), sem metadata de segmento.
- Consistência global: `boundary_data->>'expectedEntityCount'` do segmento ICS vs. total real de entidades.
- Revisões aplicadas: `2026.4-p14.x`, `2026.4-p5.x`, `2026.4-p7.x` conforme tags da migração.

## Passo 4 — Auditoria completa do Pavilhão 3 (B6)

Revisão somente-leitura confirmando os 214 módulos na revisão `2026.4-p3.3`:

- Contagem de módulos ativos = 214, numeração contígua M001–M214 sem lacunas/duplicatas;
- Revisão de metadata = `2026.4-p3.3` em todos os módulos;
- Geometrias: presença de polígono válido em `map_entity_geometries` (versão ativa por módulo), áreas > 0;
- Segmento: todos vinculados a `industria-comercio-servicos` (segmento canônico consistente);
- Integridade de pavimento: entidade-pai B6 ativa, sem órfãos (`parent_entity_id` íntegro);
- Cruzamento com `commercial_lots`/`map_lot_lineage` para confirmar espelhamento comercial.

## Passo 5 — Relatório final em PT-BR

- Tabela-resumo: pavilhão → identificador → módulos esperados × encontrados → segmento → revisão.
- Status GO/NO-GO por etapa e confirmação de que o inventário total oficial (657+ módulos da revisão 2026.4) está íntegro.

## Notas técnicas

- Nenhuma migration histórica será reescrita além das correções mínimas já autorizadas; a 5/5 será transmitida com o conteúdo completo corrigido (arquivo do repositório sincronizado antes).
- Toda verificação usa apenas consultas de leitura; nenhum dado de negócio é alterado fora da própria migração transacional (rollback automático em caso de falha de qualquer portão interno).
- Avisos do linter de segurança exibidos após a migração são preexistentes do projeto, não introduzidos por esta migração.
