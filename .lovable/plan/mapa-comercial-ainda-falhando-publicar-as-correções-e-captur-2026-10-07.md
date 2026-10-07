# Mapa Comercial ainda falhando: publicar as correções e capturar a causa real

## O que foi confirmado
- O site publicado (fenasojagestao.com) ainda usa a versão antiga. Os arquivos servidos não têm as correções da última rodada: novas tentativas automáticas, "Reconectando…" e a etapa só concluída com dados válidos. Os prints mostram exatamente o comportamento antigo.
- A mensagem do print ("Não foi possível carregar os dados do mapa") é a genérica. O erro não foi reconhecido como demora, conexão ou permissão, então a causa exata ainda não aparece na tela.
- Os registros do banco da última hora não mostram erros, e a prévia não enviou registros desta falha. A causa ainda precisa ser reproduzida com uma sessão real.

## O que será feito
1. **Reproduzir com sessão real (sem alterar dados):** entrar na prévia como um administrador e como Felipe (acesso só de consulta) e abrir `/mapa-comercial`. Para cada consulta da abertura serão registrados duração, código de resposta e sequência de tentativas.
2. **Corrigir a causa encontrada:** consulta lenta, erro do servidor, permissão ou outro, com a menor mudança possível. Se for uma consulta lenta no banco, ela será otimizada na origem com mudança somente aditiva, sem alterar vendas, lotes ou permissões.
3. **Erro identificável na tela:** a mensagem final mostra um código curto (ex.: "Ref. 57014 · tentativa 5/5"), sem dados pessoais, para que o próximo relato traga a causa. Erros hoje "desconhecidos" passam a ser classificados pelo código HTTP real da resposta.
4. **Rede de segurança para falhas do servidor:** respostas 500/502/503 sem código passam a contar como temporárias, para cair nas novas tentativas automáticas em vez da tela final.
5. **Testes e verificação:** testes automatizados dos novos casos e conferência da abertura na prévia com as duas contas.
6. **Publicação:** só com o seu pedido explícito. Recomendo publicar ao final, porque sem isso os usuários continuam vendo a versão antiga.

## Detalhes técnicos
- Diagnóstico: `lovable auth-session` para admin e Felipe, e Playwright medindo `network`/`console` em `/mapa-comercial`.
- `commercialMapRetryPolicy.ts`: ler `status` e `code` de PostgrestError/FunctionsHttpError e da resposta HTTP.
- `CommercialMapPage.tsx`: referência curta do erro e número de tentativas na tela final.
- `commercialMapService.ts`: anexar o status HTTP ao erro devolvido pelas consultas.
- Migration aditiva somente se a medição apontar uma consulta cara.
