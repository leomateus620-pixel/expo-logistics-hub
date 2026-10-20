# QA de design — agrupamento empresarial dos pavilhões

final result: blocked

A integridade comercial, o SVG dos componentes e os PDFs foram verificados. A aprovação visual final em navegador permanece pendente: a ferramenta passou a retornar `Local browser use is disabled in Work settings` após as primeiras capturas e a conferência autenticada. A PR deve permanecer em rascunho até completar essa etapa. Este relatório substitui a aprovação anterior que se referia à arquitetura de contornos por contrato, agora corrigida.

## Alvo

Pedido e sete anexos de 20/10/2026: uma empresa, uma identificação principal, todos os seus lotes, documentos independentes, contornos e líderes leves. O esquema conceitual fornecido é uma referência de hierarquia; as cores e geometrias reais permanecem as do cadastro. Não é uma clonagem da superfície preta do exemplo.

## Etapas e evidências

1. **Identificação real — conferida em leitura.** Chrome Leo, Dashboard publicada: Ótica Diniz 58–63; American Fisio 247–251; Adri Modas 85–89; Via Mundi 49–56. Os subconjuntos tinham o mesmo ID de expositor. A documentação distingue os lotes adicionais do enunciado. [Observações](docs/validation/pavilion-company-grouping/authenticated-observations.json).
2. **Representação empresarial — SVG conferido.** Renderização dos componentes React com o mesmo fixture antes/depois: sete cards viram três no P12; cinco viram dois no P13. Caminhos, IDs, numeração, status e preenchimentos são iguais. Contorno 1/1,6 px, líderes 0,85/1,1 px, sem halo branco ou ramificações por célula. [Antes/depois e limites da renderização](docs/validation/pavilion-company-grouping/README.md#evidências-visuais).
3. **Seleção e contratos — testes React aprovados.** Empresa completa preservada durante inspeção do documento; traço secundário somente no subconjunto real; uma etiqueta; limpeza de estados e navegação. Zoom e seleção persistem pela modal; foco retorna ao acionador. Os testes não comprovam por si só a qualidade de enquadramento CSS real.
4. **PDF — conferido visual e programaticamente.** A3 vetorial com 257/104 números, etiqueta única por empresa, cores originais e contratos na seção detalhada. Páginas renderizadas sem sobreposição ou corte; nenhuma imagem raster no PDF. [Relatório](docs/validation/pavilion-company-grouping/pdf-report.json).
5. **Navegador e mobile depois — bloqueados.** É necessário recapturar a versão final em desktop e mobile, inspecionar padrão/seleção/documento, testar zoom, entrada/saída da tela cheia, mostrar/ocultar conexões, teclado e console. Não foi declarada conformidade de acessibilidade a partir de imagens ou jsdom.

## Limites

Os PNGs com sufixo `-svg` são rasterizações do SVG real, não screenshots. A tipografia/traços do diagrama foram inspecionados; layout responsivo, recortes em viewport e comportamento visual de scroll não receberam aprovação final. As renderizações mantêm a aparência clara da Dashboard e os números livres de conexões. Nenhum ativo raster foi necessário: a planta é o diagrama vetorial cadastral solicitado.

Não há falha conhecida de vínculo comercial ou de composição do diagrama nos cenários testados. Não se afirma ausência de regressão visual no navegador enquanto a etapa 5 estiver pendente.
