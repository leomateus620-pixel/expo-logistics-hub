## Limpeza do transporte de teste

Identifiquei o transporte de teste: **"Outros" — Parque → Florianópolis (07/05, 10:28)** — id `f43e953f`, com KM retirada **6283** e KM devolução **7058** (775 km), no veículo **AMAROK (JDF6D47)**.

Esse registro gerou:
- 2 linhas em `vehicle_usage` para o Amarok (775 km e 774 km — uma duplicada), que são a fonte do custo estimado em **Veículos Botolli** (KM × R$ 0,65).
- Atualizou o `km_atual` do Amarok de **6283 → 7058**.

### Ações (via migration SQL)

1. Apagar as 2 linhas de `vehicle_usage`:
   - `776cd7e8-db5f-4cee-9720-15ef292b71e9` (774 km)
   - `0d2067b9-c869-4e4b-b8b3-524cb2a2e4d6` (775 km)
2. Apagar o transporte `f43e953f-5933-4d89-a135-abfddf0f9c16` (sem hóspedes nem despesas vinculadas — seguro).
3. Restaurar `vehicles.km_atual` do Amarok para **6283** (último valor real antes do teste, conforme o transporte anterior `5a51d4ee` — Aeroporto/Imigrantes 06/05).

Resultado: o custo estimado e os KM rodados do Amarok no menu Veículos Botolli voltam ao estado anterior ao teste.

Posso executar?