## Gerar PDF idêntico ao anterior, com período 28/04 → 07/05/2026

Reaproveitar o script `/tmp/relatorio/gen.py` (mesma estrutura, layout Liquid Glass, KPIs, gráficos e tabelas) ajustando apenas:

1. **Janela de datas**
   - `PERIOD_START = '2026-04-28'` (mantém)
   - `PERIOD_END = '2026-05-08'` (exclusive — inclui até o final de 07/05)

2. **Textos do relatório**
   - Atualizar nota de rodapé/observações: "Período considerado: 28/04/2026 a 07/05/2026".
   - Atualizar título/subtítulo onde aparece o intervalo.

3. **Execução**
   - Rodar `python /tmp/relatorio/gen.py` → gerar `/mnt/documents/Resumo_Operacional_Logistica_Fenasoja_2026_28abr-07mai.pdf` (novo nome para preservar o anterior).

4. **QA visual**
   - Converter páginas em JPG via `pdftoppm`, inspecionar cada uma (overlap, corte, fontes), corrigir se necessário, re-renderizar.

5. **Entrega**
   - Emitir `<lov-artifact>` apontando para o novo PDF.

Sem alterações no código do projeto — é apenas execução de script de geração de artefato.