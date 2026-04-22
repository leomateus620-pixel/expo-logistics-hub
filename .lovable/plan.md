

## Corrigir fuso horário do menu Eventos Fenasoja (UTC → SP/Brasília)

### Diagnóstico
O formulário grava os horários como **UTC** porque envia a string `datetime-local` (ex: `2026-05-03T10:00`) sem offset, e o Postgres interpreta como UTC. Resultado: ao exibir em SP (UTC-3), a hora aparece 3h adiantada (ex: cadastrei 10:00 → mostra 07:00 ou 13:00 dependendo do caso).

Da mesma forma, na edição o `slice(0,16)` corta direto da string UTC do banco em vez de converter para SP, e o "Repetir diariamente" usa `toISOString()` (UTC) ao clonar — propagando o desvio.

O projeto já tem helpers prontos em `src/lib/utils.ts`:
- `ensureSPOffset(value)` → adiciona `-03:00` (ou `-02:00` no horário de verão) antes de enviar
- `utcToSPLocal(iso)` → converte ISO UTC → `YYYY-MM-DDTHH:MM` em SP para o input

### Solução

Aplicar o padrão SP (`mem://architecture/padrao-fuso-horario-sp`) em **3 pontos** do fluxo de Eventos Fenasoja:

**1. `src/components/fenasoja/EventForm.tsx` — pré-preenchimento na edição**
Usar `utcToSPLocal()` em vez de `slice(0, 16)` para que o input mostre o horário correto de SP ao editar.

**2. `src/components/fenasoja/EventForm.tsx` — envio ao salvar**
Aplicar `ensureSPOffset()` em `inicio_em` e `fim_em` no `payload` antes de mandar ao banco. Assim a string `2026-05-03T10:00` vira `2026-05-03T10:00-03:00` e o Postgres armazena corretamente.

**3. `src/components/fenasoja/EventForm.tsx` — recorrência diária**
Substituir `newStart.toISOString().slice(0,16)` por uma construção local SP (formatar manualmente com `pt-BR`/`sv-SE` no fuso `America/Sao_Paulo`) e aplicar `ensureSPOffset()` igualmente. Evita desvio cumulativo nos clones.

**4. Correção dos dados já cadastrados (se houver)**
O único registro existente é o "Evento Parlasul" gravado como `08:00–12:00 UTC` (= `05:00–09:00 SP`), que **já está correto** e seguirá exibindo `05:00 → 09:00` no card. Nenhuma migração de dados necessária.

### Resultado esperado
- Cadastrar um evento "10:00 às 12:00" no formulário → card exibe `10:00 → 12:00` (e não 07:00 ou 13:00)
- Editar um evento existente → input vem pré-preenchido com o horário SP real
- "Repetir diariamente" mantém o horário SP exato em todas as cópias
- Banco continua armazenando em UTC (padrão `timestamptz`), mas com o offset SP aplicado corretamente na ida e na volta

### Arquivos
| Arquivo | Mudança |
|---|---|
| `src/components/fenasoja/EventForm.tsx` | `utcToSPLocal` no init de edição; `ensureSPOffset` no payload; reformulação do loop "Repetir diariamente" para preservar SP |

Sem migrações de banco. Sem alteração no `EventCard` (já usa `rawTime` em SP).

