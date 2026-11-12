# Preparação e conferência de importações

A rota `/comissoes/soja-store/importacoes` consulta lotes em `imports.view`. A capacidade `imports.manage` também permite preparar um CSV, registrar correções e concluir ou reabrir a conferência. A preparação requer a identidade e versão da fonte, sua classificação, o CSV UTF-8 e o mapeamento de pelo menos uma coluna. Aba e data-base podem ficar pendentes.

A primeira linha do CSV fornece os cabeçalhos. O operador informa ponto e vírgula ou vírgula como separador. São aceitas aspas escapadas e quebras de linha dentro de campos entre aspas. O limite por lote é 256 KiB, 250 registros, 30 colunas e 2.000 caracteres por célula. A linha apresentada corresponde à linha física da fonte. A interface permite conferir cada valor original ao lado da interpretação inicial ou da correção registrada.

O servidor calcula SHA-256 sobre os bytes UTF-8 do arquivo, preservando BOM e quebras de linha quando presentes. O banco guarda o texto original, o ID da fonte, a versão, a aba, os valores por linha, a interpretação inicial, as divergências e o autor da preparação. Os índices impedem nova cópia do mesmo conteúdo no escopo e a reapresentação de arquivo, versão e aba com conteúdo diferente. Uma correção vira revisão do lote existente. Mapeamentos adicionais para outras colunas e formatos de arquivo dependem de extensão do importador.

Campos vazios, expressões, números ambíguos e valores fora do formato aceito são encaminhados para conferência. A normalização inicial guarda decimais exatos como texto canônico e mantém valores desconhecidos nulos. A classificação selecionada registra o tipo de evidência e permanece disponível para quem revisa o lote. Documentos originais com acesso restrito devem ser tratados somente por quem recebeu as capacidades de importação correspondentes.

| RPC | Efeito |
|---|---|
| `soja_store_stage_import` | Preserva o original, interpreta a estrutura, grava linhas e divergências em uma transação. |
| `soja_store_import_batches` | Lista lotes paginados do escopo autorizado. |
| `soja_store_import_preview` | Abre metadados e linhas paginadas com o original e a última revisão. |
| `soja_store_review_import_line` | Grava nova versão com campos conferidos, decisão e motivo. O original e a interpretação inicial permanecem disponíveis. |
| `soja_store_review_import_batch` | Conclui a conferência após resolver as linhas pendentes ou registra uma reabertura motivada. |

A revisão usa a versão esperada, o autor da sessão e uma chave de envio. Uma conferência concorrente na mesma linha retorna conflito de versão. A conclusão do lote trava a mesma linha de controle usada pelas revisões e verifica a contagem atual de pendências. Os motivos e estados anteriores são auditados na mesma transação. Conferência de lote é uma etapa preparatória para a decisão sobre o que será lançado. Publicação no histórico, carga de saldos e reconciliação operacional exigem fluxo posterior com aprovação de cobertura, deduplicação de fatos e data de corte.

O teste `node scripts/soja-store/import-qa.mjs` usa o mesmo servidor PostgreSQL descartável descrito na [base de dados](./banco.md). Ele verifica CSV com BOM e CRLF, campos entre aspas, posição física, leitura e escrita por capacidade, deduplicação, idempotência concorrente, rejeição de arquivo malformado, conferência versionada, bloqueio de pendências e reabertura.
