## Correções no PDF (V8) — base V7

### Custos por veículo (valores reais do banco — `fuel_records`)

| Placa | Modelo | Viagens (transp.) | KM odômetro | Litros | Combustível |
|---|---|---|---|---|---|
| JDF6D47 | AMAROK | 13 | 2.892 | 144,33 | **R$ 755,64** |
| TQX7C18 | T-CROSS | 6 | 1.249 | 111,16 | **R$ 742,22** |
| IZT7H43 | T-CROSS | 6 | 642 | 121,97 | **R$ 814,21** |
| IZH9J56 | UP | 3 | 219 | 0,00 | **R$ 0,00** |
| IXU8B21 | UP | 2 | 178 | 45,06 | **R$ 299,38** |
| TQW2A80 | SAVEIRO | 0 | 0 | 0,00 | **R$ 0,00** |
| — | DEFENDER 4x4 | — | — | 107,87 | **R$ 725,61** |
| **TOTAL** | 7 veículos | **30** | **5.180** | **530,39** | **R$ 3.337,06** |

Combustível total bate exatamente (R$ 3.337,06). Distribuição por veículo do V7 estava estimada/incorreta — será 100% substituída pelos valores reais acima.

### Quilometragem — exibir os dois números

Adicionar nota explícita na seção da Frota e na auditoria de KM:

> **KM total registrado:** **5.180 km** (cálculo do sistema, soma de `vehicle_usage`).
> **KM total odômetro físico dos carros:** **5.811 km** (leitura direta dos painéis ao final do período).
> Diferença de **631 km** corresponde a deslocamentos internos no parque e trechos sem registro de viagem no sistema.

### Mudanças pontuais no PDF

1. **Tabela "3. Frota Operacional"**: substituir todas as linhas pelos valores reais acima. Total: 30 viagens / 5.180 km / 530,39 L / R$ 3.337,06.
2. **Bloco de auditoria de KM e CO₂**: mostrar ambos os totais (5.180 sistema / 5.811 odômetro) e calcular CO₂ sobre 5.811 km (oficial físico) → ≈ **1.336 kg CO₂**.
3. **Capa e KPIs**: manter "5.811 km" como número oficial destacado, com subtítulo "(5.180 km registrados pelo sistema)".
4. **Texto da seção da frota**: nota técnica de transparência citando origem dos dados (`vehicles` + `vehicle_usage` + `fuel_records`, em 10/05/2026).
5. **Manter intacto** todo o resto do V7: design, capa, equipe (9 nomes da LOGÍSTICA), Hotel Imigrantes como hospedagem, sem Sprinter/Kombi, 22 carrinhos elétricos / 2.157 h, hóspedes, eventos, mobilidade, conclusão. Sem checklist, sem comparativos de versão.

### Implementação

- Duplicar `/tmp/genrep_v7.py` → `/tmp/genrep_v8.py`.
- Atualizar header/metadata para "v8" e saída para `Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v8.pdf`.
- Substituir array `fleet` pelos 7 veículos reais.
- Atualizar bloco de KM/CO₂ para exibir ambos os totais.
- Atualizar litros (530,39) e texto introdutório dos transportes (30 com veículo / 32 concluídos).

### QA obrigatório

- `pdftoppm` em todas as páginas.
- Conferir: tabela da frota com valores reais; "5.180 km (sistema) / 5.811 km (odômetro físico)" presente em todos os pontos relevantes; total combustível R$ 3.337,06; CO₂ ≈ 1.336 kg; demais seções idênticas ao V7.

### Entregável

`Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v8.pdf`
