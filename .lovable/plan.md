## Diagnóstico — KM "Veículos Botolli" está DUPLICANDO

Verifiquei a base e encontrei **duplicação sistemática** dos KM rodados na tela de Veículos.

### A causa

O hook `src/hooks/useVehicleUsage.ts` soma **duas fontes que representam a MESMA viagem**:

1. `transports.km_devolucao - km_retirada` (KM informado no transporte)
2. `vehicle_usage.km_rodados` (registros "Ida automática" / "Volta automática" criados pelo `transport-lifecycle` para cada transporte)

Linha do problema: `const totalKm = transportKm + usageKm;`

Toda viagem concluída cria automaticamente 2 registros em `vehicle_usage` (ida + volta) cuja soma já equivale ao `km_devolucao − km_retirada` do transporte. Logo, somar as duas fontes **dobra o valor**.

### Comparação real (números do banco hoje)

| Placa | KM transports | KM vehicle_usage | Total exibido (errado) | Total correto |
|---|---:|---:|---:|---:|
| IXU8B21 (UP) | 147 | 147 | **294** | **147** |
| IZH9J56 (UP) | 135 | 140 (135 auto + 5 manual) | **275** | **140** |
| IZT7H43 (T-Cross) | 560 | 560 (280+280 auto) | **1.120** | **560** |
| JDF6D47 (Amarok) | 143 | 143 | **286** | **143** |
| TQX7C18 (T-Cross) | 630 | 636 (630 auto + 6 manual) | **1.260** | **636** |
| TQW2A80 (Saveiro) | 0 | 0 | 0 | 0 |

KPI "KM Rodados" no topo da tela está mostrando aproximadamente **3.235 km**, quando o valor correto é **~1.626 km** (≈ metade).

### Inconsistência adicional encontrada

Transporte `9da9dd3c…` (T-Cross IZT7H43, Santa Rosa→Passo Fundo): `km_retirada=0` e `km_devolucao=560`. O odômetro real do veículo é 87.691, então `km_retirada=0` é claramente um valor inválido digitado. A diferença (560) coincidentemente bate com a distância da rota, mas o registro fica visualmente estranho. Vou apenas sinalizar — não vou alterar o transporte sem você pedir.

---

## Correção proposta

**Fonte única de verdade = `vehicle_usage`**, porque:
- É a tabela canônica de utilização (cobre transportes automáticos E usos manuais como "Retirada botolli", "Imigrantes centro civico").
- `km_rodados` é coluna `GENERATED ALWAYS` (`km_chegada − km_saida`), garantindo integridade.
- Cada transporte concluído já gera 2 entradas (ida+volta) — não há perda de dado.

### Mudança em `src/hooks/useVehicleUsage.ts`

Remover a soma de `transports`. Manter apenas `vehicle_usage`:

```ts
// ANTES
const totalKm = transportKm + usageKm;
kmByVehicle[id] = (transportKmByVehicle[id] || 0) + (usageKmByVehicle[id] || 0);

// DEPOIS
const totalKm = usageKm;
const kmByVehicle = usageKmByVehicle;
```

A query de `transports_km_all` e os mapas `transportKm*` serão removidos (não há mais consumidores). `allTransports` continua exportado vazio por compatibilidade caso outro lugar importe (vou checar e limpar se ninguém usar).

### Impacto verificado
- **Tela Veículos Botolli** (KPI "KM Rodados" + card de cada veículo) → passa a mostrar valores corretos.
- **Relatório PDF do veículo** (mesma fonte `kmByVehicle`) → corrigido.
- **Página `KmEmissoesPage` / `kmConsolidation.ts`** → NÃO usa esse hook, já calcula via rotas conhecidas. Sem impacto.

### Validação pós-deploy
Após a alteração, os totais por veículo no card devem bater exatamente com a coluna "KM vehicle_usage" da tabela acima.

Não há mudança de banco necessária — apenas frontend.
