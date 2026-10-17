# Base pública nos bots da Equipe Fenasoja

A capacidade integra o chat existente em `/equipe-ia` e o painel já usado nos módulos. Qualquer pessoa com acesso à Equipe pode perguntar a qualquer bot. Uma correspondência elegível recebe o texto revisado, ressalvas, edição/período e fontes. Não existe outro chat, editor administrativo, flag, ativação por organização ou importação manual.

Isso fica disponível após aplicar as migrations e publicar o código. O deploy de frontend sozinho não publica o banco. A entrega foi desenvolvida e verificada localmente; a situação exata de comandos, ambiente remoto e publicação está em [validacao.md](validacao.md).

- [Como usar](tutorial-usuario.md)
- [Curadoria e atualização](atualizacao.md)
- [Banco, contratos, executor e recuperação](banco.md)
- [Evidências e limites da validação](validacao.md)
- [Manifesto gerado](../../data/kb/manifest.json)

## Conteúdo e proveniência

Revisão `2026-10-17`, normalizador `1`. A Fenasoja contém 372 entradas e 1.245 ocorrências de perguntas; a expandida contém 2.414 entradas e 10.889 perguntas. Total: **2.786 entradas e 12.134 perguntas**, com repetições preservadas por ID. Os status originais são mantidos: Fenasoja 258 confirmados, 47 parciais, 12 conflitos e 55 sem fonte; expandida 2.337 confirmados, 63 parciais, 11 dinâmicos e 3 sem fonte.

Os quatro anexos e os 20 arquivos do ZIP foram lidos e conferidos. O CSV recebido chama-se `fenasoja-kb.csv`, sem o sufixo `(1)` mencionado na especificação. Cada acervo é importado exclusivamente de seu JSON principal. CSV, Markdown e recortes são conferência e proveniência. Originais, hashes, evidências factuais e relatório de leitura ficam em `data/kb/raw/`, separados das fontes revisadas.

`confirmado` significa sustentado pela fonte registrada, não atual ou necessariamente oficial. Atribuições, licenças e itens de livros/Wikipédia são preservados. Datas de acesso dos anexos continuam declaradas; somente verificações explicitamente registradas em `raw/factual-review.json` foram refeitas. A revisão estrutural cobre o acervo inteiro; a revisão factual prioriza conflitos, calendários, valores, regras e referências móveis, sem alegar nova conferência factual de todos os livros ou páginas.

O manifesto calcula 4.964 ocorrências de fonte e 677 URLs distintas no conjunto; são 610 URLs na expandida. As 17 colisões normalizadas estão em `query-policies.json`. A escolha de HIS-013 preserva a divergência da 8ª edição; ED25-VICE tem prioridade editorial estável sobre a resposta compatível F26-014; perguntas sem fase sobre pastejo de ovelhas pedem contexto.

## Caminho de uma resposta

1. O orquestrador valida o JWT e `ai_workers_can_access`; o motor admite o turno e mantém a recusa de mutações.
2. Intenções internas de vendas, lotes, clientes e agenda mantêm suas ferramentas. Perguntas públicas elegíveis usam `interpretKbQuery(message, now)`, com um relógio único e data civil de São Paulo.
3. `workers_search_kb` consulta perguntas normalizadas, filtra assunto/edição/período antes de limitar e devolve entradas distintas. O score final é sempre trigramas. Um piso de recuperação 0,30 usa um predicado compatível com o GIN sem eliminar candidatos que poderiam atingir os limiares de resposta. O plano local medido escolheu varredura sequencial sob RLS; o índice não é uma promessa de plano ou latência.
4. A seleção prefere Fenasoja a partir de 0,45, exceto se a expandida superar seu score em pelo menos 0,10 e atingir 0,50. Empates relevantes até 0,02 pedem esclarecimento. Esses parâmetros iniciais ficam exclusivamente em `KB_THRESHOLDS`; a matriz é evidência de regressão, não uma alegação de calibração universal.
5. `composeKbResponse` produz `fenasoja-response` versão 1 com `intent=knowledge_base`. O resumo é literalmente a resposta revisada. Modelo, planejador, pesquisa web e ferramenta institucional não são chamados nesse caminho. Notas e fontes seguem regras estruturadas; instruções internas dos anexos nunca são executadas.
6. `ai_workers_finish_turn` persiste mensagem completa, citações, uso e auditoria. Depois, uma RPC registra apenas o desfecho e os identificadores mínimos. Falha isolada nesse registro não desfaz a resposta.

Sem cobertura, o fluxo anterior continua, inclusive seu roteamento de ferramentas. Uma indisponibilidade técnica da KB gera diagnóstico técnico sem conteúdo e não é registrada como `miss`. Cancelamento/autorização não iniciam fallback. O bot identificado no turno é preservado na resposta determinística.

## Tempo, fontes e consistência

O calendário é editorial, com evidências, e nunca é inferido pela periodicidade bienal. A edição de 2024 continua em novembro/dezembro com divergência na abertura; 2020 tem registro próprio de ausência; a presidência anunciada para 2030 não inventa número nem datas. A numeração de 2028 permanece parcial. Após o calendário conhecido, “próxima” não recicla uma edição vencida.

Períodos de Plano Safra/Pronaf são independentes da edição da Fenasoja. O contexto opcional da busca inclui `reference_year` (inteiro de 1800 a 2100, exigido como token do período revisado, sem dedução a partir de acesso ou `as_of`), `attribute` (`population`, `gdp`, `area`, `mayor` ou `female_president`) e `entity_name` (município normalizado nas consultas de população/prefeitura). Esses filtros precedem o corte de candidatos: uma pergunta sobre PIB não recebe geografia, nem uma cidade recebe a população de outra. Dados históricos não são promovidos a vigentes por semelhança de pergunta. Esclarecimentos não escolhem uma entrada arbitrária; pedidos com vários fatos não recebem uma resposta parcial como se cobrissem tudo.

Fontes KB usam HTTPS público e passam por validação estruturada de host, caminho, parâmetros e data civil. Uma URL arbitrária não basta: finalização e registro conferem a entrada/versionamento e as fontes cadastradas. O bloco de fontes e as citações são produzidos juntos e conferidos em ambos os sentidos. A pedido do usuário, a apresentação final é uma linha de ícones compactos; nome, “Base de conhecimento” e “Acesso declarado em” aparecem na descrição acessível e no detalhe ao passar o mouse ou focar. Não há ícones de comprovação para `sem_fonte`.

A mesma entrega simplifica a abertura existente: remove a faixa interna sobre contexto da tela, mantém esse contexto para as ferramentas, reúne os cinco atalhos laterais em ícones e destaca FENASOJA em azul. Sugestões de perguntas e descrição mudam a cada minuto, pausando durante interação/digitação. Clicar em um cartão só preenche o campo; o envio continua explícito.

Cada resposta identifica seu bot por um mascote pequeno. Durante o processamento ele acompanha três pontos; ao concluir, os pontos saem e o personagem permanece com movimento suave e piscadas. O nome continua acessível e a identidade vem da mensagem persistida. Pausa, visibilidade e preferência por movimento reduzido são respeitadas.

Uma troca concorrente de versão antes da finalização provoca no máximo uma nova busca e composição com o mesmo relógio. Texto e fontes de versões diferentes nunca são combinados. A telemetria posterior também recusa atribuir à resposta antiga a versão nova.

## Arquitetura e publicação

O checkout vigente continha as migrations de persistência `20261017030000` e identidade `20261017060000`, além do espelho Drizzle `0017`. A migration aditiva usa `20261017070000`; o seed inicial usa `20261017080000`; o espelho é `0018`. A única função antiga substituída é a finalização vigente, ampliada para citações KB. Sanitizadores, tabelas e políticas anteriores são preservados.

O seed gerado é uma transação com lotes internos dimensionados pelo gerador. Ele faz upsert, sincroniza variantes, valida contagens, registra versão/hash, protege contra downgrade e só retira IDs explicitamente gerenciados. Eventos não são apagados. Há um único executor por migration, conforme o histórico real do ambiente; veja [banco.md](banco.md). O checkout não revelou um workflow que publique migrations automaticamente.

O módulo KB é somente servidor. Não entra no registro gerado das ferramentas de dados nem no `readTools` do planejador. JSONs completos ficam fora de `public/` e do bundle de frontend. A prévia local lê o acervo no servidor de teste, sem expô-lo ao navegador. Não foram adicionados provedor, segredo, variável de ambiente, dependência, pgvector ou embeddings. FCM, Google Sync, Agenda Meeting e Mapa Comercial não recebem alterações desta entrega.

Para recuperação, mantenha suporte de leitura a citações KB enquanto houver mensagens persistidas. Conteúdo anterior é republicado como nova revisão/migration; nunca se reescreve o histórico nem se apagam eventos. [opcional-embeddings.sql](opcional-embeddings.sql) é apenas uma nota técnica não aplicada.
