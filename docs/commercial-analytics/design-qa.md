# Design QA

Final result: passed — escopo visual verificado em Chrome desktop com emulação responsiva.

Comparação: [antes/depois lado a lado](screenshots/comparison.png), ambos a 1440 × 1000 CSS px, mesma rota, inventário fictício, etapa Renovação e posição inicial. Capturas do Chrome em DPR 2 foram normalizadas para a resolução CSS. As capturas fornecidas pelo usuário orientaram a hierarquia; os valores de produção não foram reutilizados como dados de demonstração.

A identidade, os três valores e a barra existentes permanecem reconhecíveis. O botão e a prévia ocupam a coluna de confirmadas; o tempo médio divide a segunda linha com a evolução. Revisão em detalhe dos controles, duração e parcelas: [fluxo](screenshots/cashflow-1440.png), [assinaturas](screenshots/signature-1280.png). Sem diferenças P0/P1/P2 visuais pendentes no escopo conferido.

Achados corrigidos na iteração: largura mínima nativa do fieldset causava corte no celular; foi removida e o cabeçalho foi reorganizado. As novas capturas [390 px](screenshots/cashflow-390.png) e [detalhe](screenshots/cashflow-detail-390.png) mostram os controles e os valores sem rolagem horizontal. [430 px](screenshots/overview-430.png) e [1280 px](screenshots/overview-1280.png) completam a conferência.

Interação: entrada pelo card, escolha de base/ano/mês, detalhe de assinatura, retorno e foco verificados; timer e pausa cobertos por testes. A nota percorre um SVG local entre o botão e o valor, com troca conjunta de mês/valor na chegada, sem refetch. A exceção de movimento reduzido solicitada pelo usuário fica limitada a essa prévia; há pausa explícita, suspensão em aba oculta e fora da viewport.

Limites: emulação não comprova aparelho físico, teclado virtual, acessibilidade integral ou sessão autenticada de produção. O harness fixa a escala inicial para capturas comparáveis; a aplicação real mantém seu viewport existente.
