

# Fase 2 — Despesas: QR Scanner, Integrações e UI Premium

## Auditoria Resumida

**Estado atual:**
- Módulo funcional com CRUD básico, 5 tabelas com RLS, formulário com selects de transporte/veículo/membro, upload de comprovantes, listagem com filtros por status, tabs Lançamentos/Ressarcimentos
- Dashboard já tem card "Registrar Despesa" com contadores

**Limitações encontradas:**
1. **Sem scanner QR** — nenhuma lib de QR instalada
2. **Categorias vazias** — seed não foi executado, tabela `expense_categories` depende de cadastro manual
3. **Integração fraca** — selecionar transporte não sugere veículo/motorista automaticamente; sem auto-fill inteligente
4. **UI funcional mas básica** — cards simples `bg-muted/40`, sem profundidade liquid glass, formulário denso sem separação visual clara, sem modo QR scan
5. **ExpenseCard sem onClick útil** — recebe prop mas não abre detalhes
6. **Sem `origem_lancamento`** — campo não existe na tabela para diferenciar manual vs QR

---

## Plano de Implementação

### 1. Migration: Seed de categorias + campo `origem_lancamento`

- Adicionar coluna `origem_lancamento text default 'manual'` à tabela `expenses`
- Seed idempotente de 14 categorias padrão usando uma function `seed_default_expense_categories(org_id)` chamada on-demand (ao abrir o módulo, se não houver categorias)
- Alternativa mais simples: seed via migration com `INSERT ... ON CONFLICT DO NOTHING` usando org_id placeholder — mas como é multi-org, melhor usar hook no frontend que cria categorias default se `categories.length === 0`

**Decisão**: Hook `useExpenseCategories` fará auto-seed via mutation se retornar vazio para a org. Categorias: Combustível, Pedágio, Alimentação, Hospedagem, Manutenção, Lavagem, Estacionamento, Frete de Apoio, Despesas Diversas, Reembolso, Diária, Nota de Compra, Material Operacional, Emergencial.

### 2. QR Code Scanner

**Dependência**: Instalar `html5-qrcode` (~200KB)

**Novo componente**: `src/components/expenses/QrScannerDialog.tsx`
- Drawer no mobile, Dialog no desktop
- Usa `Html5QrcodeScanner` para acessar câmera
- Estado: `idle | scanning | success | error`
- Ao detectar QR:
  - Parse do payload (URLs SEFAZ NFC-e contêm params como `chNFe`, `nVersao`, `tpAmb`, valor)
  - Extrai campos disponíveis: chave de acesso, valor total, CNPJ emissor, data
  - Bloqueia leitura duplicada por 3s
  - Mostra preview dos dados extraídos
  - Botão "Usar dados" que popula o formulário
  - Botão "Tentar novamente" em caso de erro
- Tratar permissão de câmera negada com mensagem clara
- Cleanup do scanner ao fechar

**Parser**: `src/lib/parseNfceQr.ts`
- Parse de URL SEFAZ (formato: `http://www.sefaz.../qrcode?...`)
- Extrai: chNFe, vNF (valor), CNPJ, dhEmi (data)
- Fallback para payload genérico
- Retorna objeto tipado com campos parciais

### 3. Integração inteligente com Transportes/Veículos/Equipe

**No `ExpenseForm.tsx`**:
- Ao selecionar transporte → auto-preencher `vehicle_id` (do transporte) e `member_user_id` (motorista do transporte)
- Ao selecionar veículo → sugerir categorias compatíveis (Combustível, Manutenção, Lavagem)
- Ao selecionar membro → preencher `paid_by_name` automaticamente
- Mostrar info contextual inline (ex: "Transporte: São Paulo → Campinas • Placa ABC-1234")
- Transporte select mostra rota resumida + data

### 4. UI/UX Premium — Reformulação visual

**`ExpensesPage.tsx`** — Redesign completo:
- Header com gradiente glass sutil e ícone Receipt
- Summary cards com liquid glass (não `bg-muted/40` flat) — usar `liquid-glass-card` existente
- Tabs com visual mais refinado
- Chips de filtro com estilo premium (borda glass, hover suave)
- FAB mobile com ícone de câmera (QR) como ação secundária
- Empty states com ilustração vetorial sutil
- Listagem com agrupamento por data (hoje, ontem, esta semana, anterior)

**`ExpenseForm.tsx`** — Reorganização:
- Dividir em seções visuais com separadores: "Informações", "Contexto Operacional", "Pagamento", "Comprovante"
- Botão "Escanear Nota" destacado no topo do formulário
- Campos com labels mais claros e ícones inline
- Auto-fill visual feedback (campo preenchido por QR com badge "QR")
- Dois botões de ação no form: "Salvar" + "Escanear e Salvar"

**`ExpenseCard.tsx`** — Enriquecimento:
- Mostrar vínculo com transporte/veículo quando existir (ícone + label condensado)
- Mostrar data formatada
- Hover/active com profundidade glass
- Indicador visual de origem (manual vs QR scan)

### 5. Detalhes da despesa

**Novo componente**: `src/components/expenses/ExpenseDetailSheet.tsx`
- Bottom sheet no mobile, side panel no desktop
- Mostra todos os campos, vínculos, comprovante preview, histórico de status
- Ações: aprovar, recusar, solicitar ressarcimento, editar

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `package.json` | Adicionar `html5-qrcode` |
| `supabase/migrations/` | Coluna `origem_lancamento` |
| `src/lib/parseNfceQr.ts` | Novo — parser de QR NFC-e |
| `src/components/expenses/QrScannerDialog.tsx` | Novo — scanner QR |
| `src/components/expenses/ExpenseDetailSheet.tsx` | Novo — detalhes da despesa |
| `src/components/expenses/ExpenseForm.tsx` | Refatorar — seções, QR integration, auto-fill |
| `src/components/expenses/ExpenseCard.tsx` | Enriquecer — vínculos, data, origem |
| `src/components/expenses/ReimbursementList.tsx` | Refinamento visual |
| `src/pages/ExpensesPage.tsx` | Redesign completo — UI premium, agrupamento, QR action |
| `src/hooks/useExpenseCategories.ts` | Auto-seed de categorias padrão |
| `src/hooks/useExpenses.ts` | Suporte a `origem_lancamento` |

