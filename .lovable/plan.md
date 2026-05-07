## Remover tabela "Destinos mais atendidos" do PDF

Pequeno ajuste no script `/tmp/relatorio/gen.py`:

1. Remover o bloco linhas **374-387** (título "Destinos mais atendidos" + Table `td`).
2. Manter a linha 476 ("Destino mais atendido — N viagens") na seção de outros indicadores, pois é apenas um item de tabela resumo.
3. Output como **`_v3.pdf`** preservando o v2.
4. QA visual em todas as páginas com `pdftoppm`.

Sem mudanças no código do projeto.