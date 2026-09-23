# Mapa Comercial: bloqueio em 85%

Validação local em 2026-09-23; base `4a0f2ab9`; branch `codex/fix-commercial-map-85-percent`.

## Diagnóstico e alteração

Os três primeiros marcos somam 85%. O último aguardava três desenhos e dois intervalos consecutivos de até 100 ms. A cena podia desenhar corretamente para sempre sem satisfazer essa condição. A adaptação de qualidade aguardava esse mesmo marco. Os prints do relato são compatíveis com esse defeito; não identificam o driver ou a causa exata no computador afetado.

A abertura agora exige preparação essencial concluída, controles instalados, destino de tela saudável (`ready` ou `degraded`, caminho `direct` ou `post`) e três desenhos novos da preparação atual. A cadência continua registrada como diagnóstico. Preparação, perda de contexto, falha ou suspensão invalidam a contagem anterior. A adaptação existente continua após a abertura.

Após 30 segundos de tempo visível e ativo na mesma etapa/tentativa, o carregador oferece **Tentar novamente** e **Abrir lista**. Falhas gráficas reutilizam a recuperação existente; outros bloqueios permitem recarregamento explícito. O relógio nunca libera a cena. Uma conclusão válida tardia remove o aviso. O registro `boot-stalled` contém somente etapa, duração e estado técnico, sem inventário ou credenciais.

## Reprodução antes/depois

O teste de integração `commercialMapInteractiveBoot.test.tsx` executa o componente real com callbacks R3F controlados e o store de saúde real. Os dez casos falharam na base e passaram com a correção. Intervalos constantes de 101, 120, 250 e 1.000 ms agora abrem com três desenhos novos. Duzentos segundos sem novos desenhos continuam bloqueados. Também são cobertos controles ausentes, compilação pendente, falha, recuperação, suspensão, desenhos antigos e nova preparação após perda de contexto.

O harness `scripts/commercial-map-performance/boot-readiness.cjs` usa a cena completa da fixture existente, incluindo geometria e materiais reais. Atrasar `requestAnimationFrame` simula lentidão, não certifica um dispositivo físico.

| Execução | Injeção rAF | Resultado | Saúde / desenhos | Intervalo ao abrir |
| --- | ---: | --- | --- | ---: |
| Base | 150 ms | Permaneceu em 85% após 35 s de observação com cena preparada | ready / direct / 41 desenhos; zero perdas e erros | Não abriu |
| Correção | 150 ms | Abriu | ready / direct / 3 desenhos novos; zero perdas e erros | 151,9 ms |
| Correção | Sem atraso | Abriu | ready / direct / 3 desenhos novos; zero perdas e erros | 25,5 ms |

Ambiente: Windows 10, Chrome 153, Intel UHD Graphics `0x8A56`, ANGLE D3D11, viewport 1440×900, DPR 1, contexto de navegador novo por amostra; caches do SO/driver preservados. Tempos locais de inicialização da correção: 16.524 ms com atraso e 17.364 ms sem atraso. Não são uma comparação estatística de desempenho nem uma alegação de aceleração: compilação e caches diferem entre execuções. O snapshot DOM de saúde é limitado a uma publicação por segundo e pode ainda mostrar um desenho; a barreira usa a contagem atual em memória, registrada em `commercialMapReadiness`.

Reprodução local (com Playwright disponível):

```powershell
$env:VITE_COMMERCIAL_MAP_DIAGNOSTICS = 'true'
npm run dev -- --host 127.0.0.1 --port 5184 --mode production
# Em outro terminal:
$env:BOOT_FRAME_DELAY = '150'
$env:BOOT_EXPECT_READY = '1'
node scripts/commercial-map-performance/boot-readiness.cjs
```

`BOOT_BASE_URL`, `BOOT_LABEL`, `BOOT_OUTPUT`, `BOOT_WAIT_MS` e `PLAYWRIGHT_MODULE` permitem comparar checkouts/servidores separados. Para a base, omitir `BOOT_EXPECT_READY`. Evidências compactas das três execuções: [commercial-map-85-percent-results.json](commercial-map-85-percent-results.json).

## Cena real e recuperação

Na fixture de interface, servida a partir do build de produção com diagnósticos, foram exercitados: abertura, vista superior/isométrica, zoom, arrasto/rotação, busca do Pavilhão 1, seleção B1, detalhes, entrada/saída do interior, Modo Visita com troca para terceira pessoa e entrada de teclado, retorno da seleção e alternância lista/3D. A lista apresentou 1.691 entidades. Após essas ações: um Canvas, `ready/post`, 940 desenhos, zero perdas de contexto e erro nulo. O gesto alterou posição/quaternion da câmera e distância de 151,39 para 142,56. A abertura também ocorreu com intervalo de 179,3 ms no Chrome visível.

Na fixture gráfica, foi induzida perda de contexto durante o carregamento. Após o timeout, o botão **Tentar novamente** acionou a recuperação existente: `ready/direct`, uma perda registrada, erro nulo e três novos desenhos, com intervalo de 116,7 ms. Uma segunda perda/restauração, após o mapa já aberto, terminou em `degraded/direct`, 90 desenhos, duas perdas e `repeated-context-loss`, com a cena aberta após três desenhos novos. Esse último código é o motivo esperado da redução de efeitos, não uma falsa prontidão.

Um snapshot após a primeira recuperação registrou 547 geometrias, 105 texturas, 180 programas e 783 chamadas de desenho. Não foi realizado um ensaio prolongado de estabilidade de recursos. A implementação não cria Canvas, renderer ou controles; a contagem DOM foi verificada em execução, mas os IDs individuais de renderer/OrbitControls não foram capturados nas transições.

## Checks e limites

- 27 arquivos de testes direcionados: **278 testes aprovados e uma falha preexistente**. Incluem prontidão, carregador, saúde, shaders/contexto, qualidade adaptativa, viewport, mapa público, seleção/Vendas e Modo Visita.
- Falha reproduzida no checkout limpo da base: `commercialMapVisitInteraction.test.tsx`, caso `shows the authorized canonical segment only in expanded details, ahead of divergent legacy metadata`, expectativa `Segmento: Indústria, Comércio e Serviços` na linha 154. Não alterada neste escopo.
- TypeScript aprovado. ESLint dos arquivos alterados sem erros; um aviso preexistente `react-refresh/only-export-components` no carregador.
- Build de produção com `--manifest` aprovado (57,97 s), com aviso de tamanho de chunks. `bundle-report.cjs dist --assert-independent` aprovado: renderer, physics e PDF não são exigidos antes da consulta.
- Testes do carregador cobrem aviso, ações manuais, conclusão tardia, aba oculta, inatividade, mudança de etapa, tentativa e rota, e desmontagem. Falha gráfica usa o evento existente de retry.

Vendas foi validado por testes, pois a fixture visual usa permissões de leitura. O mapa público foi coberto pelos testes de política, ciclo de vida, recuperação e interação; não houve sessão pública real com token. Não foram testados o computador afetado, celulares físicos, Safari, autenticação de produção ou implantação. A recuperação específica do usuário depende de verificação nesse computador. A lista é alternativa operacional, sem substituir o acesso 3D.
