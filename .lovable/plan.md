

## Padronizar escrita no menu Mobilidade

### Diagnóstico
O módulo Mobilidade tem **escrita inconsistente** em vários campos texto-livre, dificultando leitura, ordenação, filtros e exportações. Exemplos reais hoje no banco:

| Campo | Variações encontradas |
|---|---|
| `member_name` | `andressa kunzler`, `BRUNA G. pEREIRA`, `Carla freisleben servat`, `lUCAS ADIEL ESCHER`, `Nicoly felller silva da silveira` |
| `member_role` | `serviços` / `Serviços`, `voluntaria` / `Voluntario`, `assessoria de imprensa`, `MEMBRO SUSTENTABILIDADE`, `Recepção ` (espaço extra) |
| `member_identifier` (CPF) | `00879183071`, `009.590.360-75`, `968678920-00`, `024287740-00` (mistura formatado/cru, alguns inválidos) |
| `operational_responsible_name` | `cARLA FREISLEBEN SERVAT` vs `Carla freisleben servat`, `elisandra simao reis` vs `Elisandra simao reis`, `Simone Casagrande ` (espaço extra) |

Resultado visual: o painel admin e a aba "Autorizados" mostram nomes em caixas/grafias misturadas, "Comissão" repete-se com sutis diferenças, e a contagem por filtro fica fragmentada.

### Solução em duas camadas (idêntica ao padrão já usado em Hóspedes/hotéis)

**1. Helpers de normalização** (`src/lib/textNormalize.ts` — novo, reutilizável)

```ts
// Title Case respeitando pt-BR + apóstrofos retos + espaços colapsados
toTitleCase(raw): "lUCAS ADIEL ESCHER" → "Lucas Adiel Escher"
                  "BRUNA G. pEREIRA"   → "Bruna G. Pereira"
                  "Simone Casagrande "  → "Simone Casagrande"

// Mantém preposições em minúsculo (de, da, do, dos, das, e)
"jose eduardo mucha" → "Jose Eduardo Mucha"
"Alexandre Dall'Agnese" → "Alexandre Dall'Agnese"

// CPF: aceita 11 dígitos puros OU já mascarado, devolve sempre "000.000.000-00"
formatCpf("00879183071")    → "008.791.830-71"
formatCpf("009.590.360-75") → "009.590.360-75"
formatCpf("968678920-00")   → "" (inválido — devolve raw trim para não perder o dado)
```

**2. Aplicar normalização em 3 momentos**

| Onde | Campo | Função |
|---|---|---|
| `MobilityForm.tsx` (criar) | `member_name`, `operational_responsible_name`, `member_role` | `toTitleCase` antes de gravar |
| `MobilityForm.tsx` (criar) | `member_identifier` | `formatCpf` antes de gravar |
| `EditMemberDialog.tsx` (editar) | mesmos 4 campos | mesma normalização ao salvar |
| `MobilityAdminPanel.tsx` + `AuthorizationsTab.tsx` (exibição) | mesmos 4 campos | aplica `toTitleCase`/`formatCpf` em runtime nos `<td>`/`<TableCell>` — **não muda dados antigos**, só corrige a apresentação |

Assim:
- **Dados novos:** já entram normalizados (gravação limpa)
- **Dados antigos:** continuam intactos no banco, mas aparecem normalizados na UI
- **Sem migração destrutiva:** zero risco de perder informação
- **Filtros e busca** passam a comparar em forma normalizada (`includes` continua funcionando porque o helper é determinístico)

**3. Sync downstream**

O hook `updateMember` já chama `sync_internal_mobility_form` após editar, que regrava `member_name`/`member_role`/`member_identifier`/`operational_responsible_name` em `mobility_authorizations`. Como gravamos a versão normalizada no `committee_mobility_members`, a tabela de autorizações herda o nome formatado automaticamente — sem mexer na função SQL.

### Critério de aceite

1. Ao abrir o painel **Mobilidade → Painel**, todos os nomes aparecem em "Title Case" (ex: `Lucas Adiel Escher`, não `lUCAS ADIEL ESCHER`)
2. Cargos como `serviços` / `Serviços` / `SERVIÇOS` aparecem todos como `Serviços`
3. CPFs aparecem mascarados como `000.000.000-00` quando válidos
4. Espaços extras no fim (`Simone Casagrande `) somem visualmente
5. Aba **Autorizados** dentro de Patinetes e Carrinhos Elétricos mostra os mesmos nomes formatados
6. Novos cadastros via **Nova Solicitação** já gravam normalizado no banco
7. Editar um integrante e salvar regrava em forma normalizada e propaga para `mobility_authorizations`

### Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/lib/textNormalize.ts` | Novo | `toTitleCase(str)` (com lista de preposições pt-BR) e `formatCpf(str)` |
| `src/components/mobility/MobilityForm.tsx` | Edit | Aplica `toTitleCase`/`formatCpf` em `member_name`, `member_role`, `operational_responsible_name`, `member_identifier` antes de `createForm`/`addMember` |
| `src/components/mobility/MobilityMemberRow.tsx` | (sem mudança) | Mantém input livre — normalização ocorre no submit |
| `src/components/mobility/EditMemberDialog.tsx` | Edit | Mesma normalização no `handleSave` |
| `src/components/mobility/MobilityAdminPanel.tsx` | Edit | Renderiza nomes/cargos/CPF passando pelos helpers; busca normaliza ambos os lados |
| `src/components/mobility/AuthorizationsTab.tsx` | Edit | Renderiza `member_name`, `member_role`, `operational_responsible_name`, `member_identifier` via helpers; busca normalizada |
| `src/lib/generateMobilityAuthorizationsExport.ts` | Edit | Aplica helpers ao montar linhas de CSV/PDF (assim a exportação também sai padronizada) |

Sem migração no banco. Sem novos hooks. Sem dependências novas. Zero risco aos dados existentes.

