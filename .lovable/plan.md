

## Corrigir data-alvo da contagem regressiva da Fenasoja

### Diagnóstico
O card `FenasojaCountdown` usa como alvo `2026-05-01T00:00:00-03:00`, mas o texto diz "abertura oficial" — e a abertura oficial da Fenasoja 2026 é **28/04/2026** (conforme já registrado no badge do próprio card: "28/04 → 09/05" e na memória `logistica/periodo-operacional`).

Hoje (23/04) faltam **5 dias** até 28/04, não 8 nem 9. O número "8 dias" aparece porque o alvo está em 01/05.

### Pergunta interpretada
Você quer que o card mostre **9 dias** — isso bate com a contagem até **02/05/2026 00:00 (UTC-3)** a partir de hoje. Mas isso entra em conflito com o rótulo "abertura oficial".

Duas leituras possíveis:

**A)** Você quer manter o alvo em 01/05 mas que o cálculo arredonde para cima (mostrando 9 em vez de 8). Solução: trocar `Math.floor` por `Math.ceil` apenas nos dias quando ainda há horas/minutos restantes — assim "faltam X dias" reflete o dia-calendário inteiro, não os blocos de 24h corridos.

**B)** Você quer corrigir o alvo para a abertura **real** (28/04), o que é mais consistente com o texto "abertura oficial" e o badge "28/04 → 09/05" do próprio card.

### Solução proposta (recomendada: A — preserva sua intenção literal)

Em `src/components/dashboard/FenasojaCountdown.tsx`:

- Manter `TARGET_ISO = '2026-05-01T00:00:00-03:00'`
- Ajustar `computeParts` para que o número de **dias** exibido use `Math.ceil(diff / 86_400_000)` quando `diff > 0`, e os blocos de horas/min/seg continuem sendo o **resto da hora corrente** (não recalculados em cima do ceil), assim:
  - O card mostra "Faltam **9** dias para a abertura oficial"
  - Os blocos seguem mostrando `09 | HH | MM | SS` decrescendo em tempo real
  - Quando faltar menos de 24h, mostra `01` dia (não `00`)
  - Quando passar do alvo, `done = true` e exibe a mensagem celebratória

Cálculo:
```ts
const totalSeconds = Math.floor(diff / 1000);
const days = Math.ceil(diff / 86_400_000);   // arredonda pra cima
const hours = Math.floor((diff % 86_400_000) / 3_600_000);
const minutes = Math.floor((diff % 3_600_000) / 60_000);
const seconds = Math.floor((diff % 60_000) / 1000);
```

Headline também ajusta: `parts.days === 1 ? "Falta 1 dia..." : "Faltam N dias..."` (lógica atual já cobre).

### Arquivo

| Arquivo | Mudança |
|---|---|
| `src/components/dashboard/FenasojaCountdown.tsx` | Trocar `Math.floor` por `Math.ceil` no cálculo de `days` dentro de `computeParts` |

### Critério de aceite
1. Hoje (23/04/2026) o card mostra "Faltam **9** dias para a abertura oficial"
2. Bloco "DIAS" mostra `09`
3. Horas/min/seg seguem decrescendo normalmente
4. Quando faltar menos de 24h, mostra `01` dia (não `00`)
5. Após 01/05/2026 00:00, mensagem celebratória aparece sem números negativos

> Se preferir a opção **B** (corrigir o alvo para 28/04 e ajustar o texto), me avise — basta mudar `TARGET_ISO` para `2026-04-28T00:00:00-03:00`.

