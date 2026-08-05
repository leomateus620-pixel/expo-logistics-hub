# Validação dos portais Exporural e Indústria, Comércio e Serviços

## Situação verificada agora (evidências)

Antes de qualquer teste, inspecionei o banco real do projeto conectado:

- Projeto conectado: `btfaumhroqtqzxomqorx` — confere com o esperado (`.env` / configuração pública).
- `to_regclass('public.map_projects')`, `public.map_segments` e `public.map_lot_lineage` retornam **NULL**.
- Nenhuma tabela `map*` ou `*lot*` existe no schema `public`.
- `user_capabilities` não possui nenhum registro de `exporural_access` nem de `industria_comercio_servicos_access` (só existem hoje `full_access`, `cronograma_reminder_all`, `mobility_access`).

Conclusão factual: **todo o domínio do Mapa Comercial não está aplicado neste banco**. Isso aconteceu porque o banco atual veio de uma restauração/remix que não trouxe a cadeia de migrations do mapa:

```text
20260710010000_create_commercial_map.sql
20260711010000_upgrade_commercial_map_2026.sql
20260712010000_correct_official_gate_names_2026.sql
20260712020000_restore_official_gate_descriptions_2026.sql
20260726120000_apply_exporural_reference_2026.sql
20260804090000_create_commission_map_segments.sql
```

Portanto, no estado atual o resultado é **STATUS FINAL: NO-GO** — não por falha de contrato, mas por ausência total do schema. Nenhuma fase de RLS, inventário, split/merge, expiração ou QA pode ser executada contra um banco sem as tabelas.

O acesso `psql` disponível é somente leitura/inserção; criação de schema precisa passar pelo fluxo nativo de migrations, que exige sua aprovação.

## O que proponho executar

### Etapa 1 — Restabelecer o schema do Mapa Comercial
Reaplicar, na ordem cronológica original e sem editar os arquivos existentes, a cadeia das seis migrations acima pelo fluxo nativo de migrations (cada uma submetida para sua aprovação, uma por vez, verificando o resultado antes de seguir). Se alguma falhar por dependência de estado que não existe mais no banco restaurado, eu paro, listo exatamente as linhas/objetos em conflito e proponho uma migration corretiva **aditiva e idempotente** com novo timestamp — nunca enfraquecendo constraint nem forçando backfill.

### Etapa 2 — Semear o projeto cartográfico e o inventário-base
Confirmar org autorizada, projeto cartográfico ativo (`is_archived = false`), UUID e `is_published`, e checar se o inventário-base (Exporural 116/95, Indústria 140/103) chega completo pelas migrations de referência. Sem inventário completo os segmentos não ficam ativos, e isso é registrado como bloqueio, não contornado.

### Etapa 3 — Auditoria estrutural
Validar por catálogos: RLS ativa, `UNIQUE (project_id, slug)`, `map_entities.segment_id`, FKs compostas, `convalidated = true`, índices, imutabilidade de projeto do segmento, triggers de associação/fronteira/ciclo de vida/linhagem, `SECURITY DEFINER` com `search_path = public, pg_temp`, grants/revokes, DML negado em `map_lot_lineage`, ausência de policy de comissão sobre `map_calibrations`, e entidades não classificadas com `segment_id = NULL`.

### Etapa 4 — Inventários
`validate_commercial_map_segments` e `get_commission_map_segment_inventory` por segmento, conferindo `complete`, contagens efetivas, geometrias correntes, referências inválidas, conflitos de exclusividade e `lineageDelta`.

### Etapa 5 — Matriz RLS com sessões reais
Requer usuários de QA. Os oito perfis exigidos (só Exporural, só Indústria, ambas, gestor, admin, membro sem capability, ex-membro, usuário do mapa completo) **não existem hoje**. Preciso da sua autorização para provisionar contas de QA dedicadas (nunca reaproveitando contas operacionais) — sem elas, a Fase E e as fases seguintes ficam BLOCKED e o status permanece NO-GO.

### Etapa 6 — Split/merge, expiração, regressão do mapa completo, desempenho e QA de navegador
Executados apenas sobre projeto/lotes de QA descartáveis. Cenários negativos, idempotência da expiração, regressão de `/mapa-comercial`, `EXPLAIN (ANALYZE, BUFFERS)` em sessões autenticadas e QA em 1440×900, 1280×720, 390×844 e 360×800 com Playwright.

### Etapa 7 — Relatório final
Entrega no formato obrigatório de 15 seções, com tabelas de ação / papel / esperado / observado / contagens / duração / evidência / PASS-FAIL-BLOCKED.

## Detalhes técnicos

- Nada de mocks, fallback local ou `service_role` como prova de RLS; `service_role` só para inspeção estrutural.
- Nenhuma migration já aplicada será editada; correções serão sempre aditivas e idempotentes.
- Nenhum `db reset` nem operação destrutiva.
- Rotas, capabilities, callbacks e o comportamento do mapa completo permanecem intocados.

## Decisões que preciso de você

1. Autorizo reaplicar a cadeia completa de migrations do Mapa Comercial neste banco?
2. Autorizo criar usuários e um projeto/lotes de QA descartáveis para as fases de RLS, split/merge e expiração? Sem isso, o máximo alcançável é NO-GO com as Fases E a J marcadas como BLOCKED.
