# Release — Rebuild Pavilhões 12, 14 e correção do Pavilhão 3 (Migração 20260824120000)

## Resultado do pré-flight (já executado, somente leitura)

- **Artefato:** `supabase/migrations/20260824120000_rebuild_pavilions_12_14_and_correct_pavilion_3.sql` presente (1.173 linhas, 49.370 bytes). Git blob `46bf5278027b8925d9f4100568a1ae087249b0f0` e commit `61824fb8` — **correspondem exatamente ao autorizado**. Será aplicado byte-por-byte, sem reescrita.
- **Histórico:** versão `20260824120000` **não consta** em `supabase_migrations.schema_migrations` — aplicação necessária.
- **Ambiente:** projeto Lovable Cloud (Supabase gerenciado), instância Tiny, ativo. Nenhum segredo será exposto.
- **Dependências:** as 13 tabelas exigidas (`map_projects` … `map_calibrations`, `map_activity_logs`) existem. A função `map_has_explicit_capability` existe.
- **Projetos ativos:** 1 — "Parque Fenasoja — referência oficial 2026". Existe **exatamente um** pavilhão canônico ativo para B2, B3 e B6 (classification `PAVILION`). Sem duplicidades ou pais ambíguos.

### Baseline comercial (snapshot pré-migração)

| Métrica | Valor atual |
|---|---|
| Lotes ativos | 262 (95 Exporural · 103 Indústria/Comércio · 64 legados `SELLABLE_LOT` sem segmento) |
| Status | 100% `BLOCKED` |
| Lotes com área oficial | 95 (todos Exporural) |
| Módulos em B2/B3/B6 | 0 entidades · 0 geometrias · 0 lotes |
| Reservas / Negociações / Vendas / Contratos | 0 / 0 / 0 / 0 |
| Preços | 262 |
| Notas comerciais/internas | 0 |

A migração deve criar 657 módulos/lotes novos (B2: 186, B3: 257, B6: 214), elevando o segmento `industria-comercio-servicos` de 103 para 760 lotes — exatamente o `expectedLotCount` declarado na migração. Os 95 lotes Exporural com áreas e os 64 legados ficam fora do escopo e devem permanecer intactos.

## Execução

1. Registrar horário inicial (UTC-3).
2. Aplicar a migração pelo mecanismo oficial de migrations (transação única `BEGIN…COMMIT`; qualquer `RAISE EXCEPTION` = rollback integral + `NO-GO`).
3. Confirmar registro da versão `20260824120000` no histórico oficial.
4. **Validação estrutural** (por projeto ativo): 186/257/214 entidades, geometrias atuais e lotes; numeração contínua 1–186 / 1–257 / 1–214; segmento `industria-comercio-servicos`; classification `INTERNAL_STAND`; revisões `2026.4-p14.1`, `2026.4-p12.1`, `2026.4-p3.2`.
5. **Validação geométrica:** pernas oeste/leste e extensões verticais 76–83 e 140–147 do B6; 7 sequências do B3; 6 sequências do B2; discrepâncias documentais em `B6-M006`, `B6-M156–M159` e `B2-M073/M074` (confirmação manual); nenhuma geometria com largura/profundidade zero ou fora do footprint.
6. **Integridade comercial:** comparar baseline × pós — 95 áreas Exporural preservadas; lotes novos com `status=BLOCKED`, áreas nulas, `UNVALIDATED`, `pricing_mode=NOT_FOR_SALE`, sem empresa/nota/reserva/venda/contrato inventados.
7. **Smoke test no preview** (Playwright): abrir Mapa Comercial, entrar no interior de B2, B3 e B6, conferir contagens 186/257/214, seleção de módulo, corredores não selecionáveis, "Não informada" nas áreas e console limpo.
8. Rodar o teste de contrato existente `commercialMapPavilions1214Migration.contract.test.ts`.
9. Emitir relatório final `GO`/`NO-GO` com antes/depois, tempos e evidências.

## Detalhes técnicos

- Sem `db reset`, `DROP`, `TRUNCATE` ou escrita manual em `supabase_migrations.schema_migrations`.
- Nenhuma outra migração pendente será aplicada junto — somente `20260824120000`.
- Risco conhecido assumido pelo artefato: a migração declara fail-closed em conflitos de identidade (ex.: `commercial_pavilion_entity_identity_conflict`); se disparar, encerra como `NO-GO` sem contorno manual.
- Incerteza documentada remanescente: módulos 73–74 do B2 permanecem sinalizados `manual-confirmation-required` por ambiguidade "74 ao 73" da fonte oficial.
