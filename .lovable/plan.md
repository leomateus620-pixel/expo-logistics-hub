## Objetivo
Cadastrar os 6 patrocinadores da Arena (do anexo), com valor, disponibilidade anual de eventos e alertas de UI quando o uso da cota anual for atingido.

## Escopo
- Apenas **Arena Fenasoja** (espaço `47bdc5e2…`).
- Vigência: 10 anos / 5 edições Fenasoja a partir de 2022 → `valid_from=2022-01-01`, `valid_until=2031-12-31`.
- Regra: cota **não acumulativa** entre anos (já suportada pela infra `venue_counterpart_agreements` + `venue_counterpart_usage`).

## Dados a cadastrar

Stakeholders (tipo `sponsor`) + Agreements (`benefit_type='space_usage'`, `unit_type='events'`, `space_id=Arena`):

| Patrocinador | Valor (R$) | Eventos/ano | Contrato |
|---|---|---|---|
| Tabacaria / Cavaline | 150.000 | 3 | — |
| Sicredi e Icatu | 150.000 (Rec. livre 1x) | 3 | 02/12/2019 |
| Alibem | 200.000 (Rouanet) | 2 | 20/12/2019 |
| Steffen | 150.000 (100k Rec.Livre 8x + 50k Rouanet) | 3 | 17/03/2020 |
| Via Certa | 270.000 (120k Rouanet + 150k Rec. Livre 1x) | 2 | 02/12/2019 |
| Cotrirosa | 150.000 (Licenciamento) | 2 | 15/10/2020 |

Observações do contrato salvas no campo `notes` de cada agreement; valor total no campo `notes`/`contract_reference` (não há coluna monetária dedicada — usaremos `notes` estruturado, ver seção técnica).

## Alerta de uso (UI)

Na tela de detalhe de eventos da Arena e no painel de patrocinadores em `VenueWorkspace`:

- **Cota disponível** (verde): `used < granted - 1`
- **Última cota do ano** (âmbar): `used == granted - 1` — aviso "Última utilização disponível em {ano}"
- **Cota esgotada** (vermelho, bloqueio de vínculo automático): `used >= granted` — aviso "Cota anual atingida — excedente requer aprovação"
- Barra de progresso `used / granted` por ano corrente, com breakdown dos eventos que consumiram a cota.
- Toast + `AlertDialog` ao tentar vincular patrocinador a um novo evento quando cota esgotada, com opção "Solicitar excedente" (já existe `approved_excess_quantity` no schema).

## Passos técnicos

1. **Migration de seed** (`supabase--migration`):
   - `INSERT` 6 linhas em `venue_stakeholders` (kind=`sponsor`, org da Fenasoja).
   - `INSERT` 6 linhas em `venue_counterpart_agreements` via `venue_upsert_agreement` (dentro de bloco `DO $$`) para respeitar auditoria/versão.
   - `notes` em JSON leve: `{"valor_total": 150000, "modalidade": "Rec. livre 1x", "contrato": "02/12/2019"}`.

2. **Componente novo** `src/components/venue-events/ArenaSponsorsPanel.tsx`:
   - Lista os 6 agreements da Arena com card liquid glass (verde/gold da identidade).
   - Mostra `granted_quantity` vs `used_this_year` (query em `venue_counterpart_ledger` filtrando por ano corrente e agreement).
   - Badge de status (Disponível / Última cota / Esgotada) com cores semânticas.

3. **Integração em `VenueWorkspace`**:
   - Nova aba "Patrocinadores" ou seção no dashboard da Arena.
   - Reutiliza hook `useVenueOperations` (`listAgreements`, `listLedger`).

4. **Aviso no formulário de vínculo** (`VenueEventFormDialog`):
   - Ao selecionar `counterpart_agreement_id`, mostrar mini-badge de cota restante do ano.
   - Se `used_this_year >= granted_quantity` → confirm dialog exigindo justificativa (já cai no fluxo de excedente existente).

5. **Verificação de prontidão** antes/depois:
   - Rodar `supabase--linter` para RLS.
   - `tsgo` para tipos após regenerar `types.ts`.
   - Confirmar que `venue_recalculate_agreement_excess` roda no INSERT do ledger (já garantido por trigger existente).

## Fora de escopo
- Restaurante Fenasoja (usuário pediu apenas Arena).
- Cadastro de contratos digitalizados (upload PDF) — pode ser feito depois via `document_path` do agreement.

## Perguntas rápidas
Confirmar apenas: **posso usar `valid_from=2022-01-01` e `valid_until=2031-12-31`** para todos (interpretação de "10 anos / 5 edições a partir de Fenasoja 2022")? Se preferir outra janela, ajusto no seed.