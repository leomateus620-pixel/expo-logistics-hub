# Contratos e histórico por ponto de alimentação

No Mapa Comercial, selecione uma estrutura de Gastronomia e expanda o ponto. Quando a venda vinculada tem assinatura confirmada, o perfil com permissão de contratos pode anexar um PDF ou DOCX de até 15 MB. O mesmo card abre o documento vigente, permite a substituição e a edição do número e reúne as versões anteriores e os eventos no histórico. O PDF abre em um visualizador, e o download obtém um novo acesso temporário. Fechar o visualizador devolve o foco ao botão da ficha.

Um contrato individual fica no ponto e na venda de origem. Um documento compartilhado usa um único arquivo por versão e aparece nas fichas dos itens abrangidos. A cobertura vigente acompanha os vínculos ativos da venda. Versões de vendas anteriores ou de pontos retirados continuam no histórico quando aquele ponto foi abrangido. O servidor valida o vínculo com a venda, a assinatura e as permissões, e registra a autoria e o horário de cada operação documental.

## Evidências da prévia

As capturas usam compradores, usuários e documentos sintéticos. O roteiro usa o PostgreSQL descartável e o armazenamento privado local da prévia.

| Etapa | Captura |
| --- | --- |
| Assinatura confirmada e PDF anexado apenas à Pizzaria | [Ficha de C2](pizzaria-contrato-anexado.webp) |
| Recarga da página e abertura da versão 1 | [Visualizador de PDF](pizzaria-visualizador.webp) |
| Substituição e atualização do número | [Versões](pizzaria-versoes-e-historico.webp) · [Auditoria com autoria, horário e número anterior e novo](pizzaria-auditoria.webp) |
| Mesmo documento na Dashboard e documento compartilhado com os dois pontos | [Contrato da Pizzaria](dashboard-pizzaria-contrato.webp) · [Abrangência em C2](dashboard-abrangencia-c2.webp) |
| Consulta no celular | [Ficha da Pizzaria](celular-pizzaria-contratos.webp) |

A verificação de produção foi somente de leitura. O bucket `map-contracts` estava privado e a migration original de Gastronomia estava aplicada. Dos 12 pontos ativos, dois estavam vendidos, com itens assinados e eventos de venda e confirmação. Nenhum dos 12 tinha contrato individual ou compartilhado na consulta. A nova migration foi verificada no banco descartável da prévia.
