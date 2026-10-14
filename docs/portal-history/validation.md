# Memória visual FENASOJA — implementação e validação

Finalizado em 14/10/2026. Base: `origin/main` em `1053c692`; implementação na branch `codex/fenasoja-visual-memory`, em worktree separado da branch financeira aberta. O site publicado `https://fenasojagestao.com/portal` foi inspecionado; as evidências desta entrega são da implementação local, não de um deploy no domínio.

## Comportamento entregue

O primeiro card do cabeçalho é o mesmo launcher do Ecossistema Fenasoja. Recebe uma galeria finita de campanhas locais em slots estáveis; a marca usa `FenasojaBrand`, texto HTML, tipografia metálica e o símbolo oficial local já documentado no projeto. A contagem oficial permanece no segundo card.

A largura interna e a marca completa, incluindo 2028, são medidas por ResizeObserver. A capacidade segue a fórmula solicitada, com slot de 96/108 px, gap de 16 px e folga central de 24 px. O padding lateral de 16/48 px entra na largura disponível. Dois slots por lado no desktop; um por lado quando necessário. Telas com pointer coarse recebem somente 2016/2024, inclusive landscape. Sem capacidade lateral, o mesmo par ocupa uma faixa inferior reservada. A marca termina no centro horizontal e vertical; não há colapso de altura no encerramento.

| Etapa | Desktop, quatro artes | Par mobile/tablet |
|---|---:|---:|
| Revelação | 600 ms | 600 ms |
| Destaques | 2014 → 2016 → 2018 → 2024, 1.400 ms cada | 2016 → 2024, 1.400 ms cada |
| Encerramento | 1.600 ms | 1.600 ms |
| Total ativo | **7.800 ms** | **5.000 ms** |

O realce entra nos primeiros 200 ms e sai nos últimos 250 ms da própria janela de 1.400 ms. A arte inativa permanece no mesmo slot com opacidade 0,86. Escala ativa: 1,08. Todas saem apenas no encerramento, nos seus primeiros 600 ms. No mobile, a marca sobe antes da revelação das imagens e volta depois de elas desaparecerem. O estado final é estático.

O relógio usa um timer por fronteira e WAAPI para transform/opacity. Aguarda `onIntroReleased` do Hero e pausa por viewport, aba oculta, pagehide ou diálogo. SessionStorage preserva ordem/tempo, não consome ciclos fora da tela e não repete ciclos concluídos, inclusive após perda total de assets durante um ciclo iniciado. Erros de download/decode são omitidos; falha total inicial mostra a marca sem consumir a sessão. Save-Data e ausência de WAAPI usam marca estática. Reduced-motion mantém esta galeria canônica por orientação expressa do solicitante; a preferência continua valendo para os demais controles do portal.

## Acessos

1. Agenda Fenasoja.
2. Agenda Restaurante e Arena.
3. Mapa Comercial.
4. Financeiro.
5. Administrador.
6. Comissões, com a expansão existente imediatamente abaixo.

`resolveAdminAccess()` e seus checks não mudaram. O card usa `adminAccess.target`, `/login/admin`, `/admin` e `saveSelectedModule('admin')`. Estados loading, login, setup, allowed e denied foram preservados. O texto permitido é “Abrir administração”. `portalTypes.ts` já representa esses estados e não precisou mudar. Nenhuma alteração de autenticação, capabilities, RLS ou banco.

## Assets medidos

WebPs fornecidos foram preservados byte a byte, com srcset 320w/640w e contain. Masters, extrações integrais de revistas, SVGs de enquadramento, fontes e créditos ficam fora de `public`, no catálogo técnico. Não houve redesenho ou conversão adicional com perda.

| Conjunto | Campanhas 320 | Campanhas 640 | Maior variante + símbolo existente |
|---|---:|---:|---:|
| Mobile, duas peças | 21.362 bytes | 61.598 bytes | 77.082 bytes |
| Desktop, quatro peças | 50.118 bytes | 147.560 bytes | 163.044 bytes |

Símbolo local existente: 15.484 bytes. Na captura desktop com DPR 1, currentSrc confirmou os quatro WebPs 320; a variante maior também foi medida. Esses números representam a galeria e a marca, não o download completo do portal/Alvorada. A preparação determinística e os SHA-256 estão em [assets.md](assets.md) e `scripts/portal-history/prepare.py` (19 arquivos verificados). SVGs, masters, referência e GIF não entram no runtime.

## Verificação no navegador

Codex In-app Browser, Vite production preview em `http://127.0.0.1:8081/portal`; nenhuma substituição de capturas por HTML desenhado. Larguras reais conferidas antes de salvar cada captura. [Medições](evidence/responsive.json) e [dimensões/bytes das capturas](evidence/capture-files.json).

| Viewport | Card final | Desvio do centro X/Y | Overflow horizontal |
|---|---:|---:|---|
| 1920 × 1080 | 114 px | 0 / 0 px | não |
| 1440 × 1000 | 114 px | 0 / 0 px | não |
| 1366 × 768 | 114 px | 0 / 0 px | não |
| 768 × 1024 | 114 px | 0 / 0 px | não |
| 320 × 720 | 176 px | 0 / 0 px | não |
| 360 × 800 | 176 px | 0 / 0 px | não |
| 390 × 844 | 176 px | 0 / 0 px | não |
| 430 × 932 | 176 px | 0 / 0 px | não |
| 844 × 390 | 114 px | 0 / 0 px | não |

Capturados destaques desktop, tablet e mobile, além dos estados finais. O registro de 79 frames cobre reveal → 2014 → 2016 → 2018 → 2024 → closing → done em 7.816 ms de amostragem; o GIF acrescenta uma breve retenção final e toca uma vez. A precisão das janelas é verificada pelos testes de relógio, sem depender da taxa de captura.

A fixture local `scripts/portal-history/text-zoom.html` monta o app real com fonte raiz de 32 px (200%), sem criar rota de produção. Em 320 px: marca, artes e todas as setas cabem; nenhuma rolagem horizontal. A marca reserva altura conforme sua medida. A quebra dos rótulos de acesso foi corrigida para impedir clipping no texto ampliado.

Testado no navegador: launcher abre/fecha o Ecossistema, volta ao foco original e remove inert; Administrador navega para `/login/admin`; retorno à rota mantém galeria e Hero concluídos; Comissões expande/recolhe os grupos existentes. A sessão anônima mantém o fallback protegido de dados organizacionais no Ecossistema. Console de aplicação sem erros nas verificações finais. Loading lento, falhas/decode, Save-Data, reduced-motion e pausas exatas têm cobertura controlada de integração/unitária; não se afirma emulação real de rede lenta ou sessão administrativa autenticada.

## Checks

- Typecheck: passou.
- Build de produção: passou; mantém o aviso de chunks grandes existentes de mapas/Three/Rapier.
- ESLint dos arquivos de implementação alterados: zero erros e zero avisos.
- Vitest pertinente: **148 testes em 10 arquivos, todos passaram**.
- Integridade dos 19 arquivos do pacote e `git diff --check`: passaram.

O npm wrapper não está no PATH deste host; foram executados os mesmos CLIs configurados pelos scripts do package.json usando o Node embutido, com dependências já existentes compartilhadas pelo worktree. Package.json e lockfile permanecem inalterados. O lint global e toda a suíte histórica não são apresentados como aprovados.

Os testes de arquitetura/portal passaram da ordem de cinco entradas para seis, com Financeiro quarto e Administrador quinto. Os contratos Alvorada agora verificam History dentro do mesmo launcher e o callback de liberação do Hero. Nenhuma verificação de acesso foi removida: foram acrescentadas concessões/negações administrativas, loading, setup, seleção persistida, coordenação, pausa/resume, erros e sessão.

## Evidências

- [Desktop em destaque](evidence/desktop-highlight-1440.jpg) · [final](evidence/desktop-final-1440.jpg).
- [Tablet em destaque](evidence/tablet-highlight-768.jpg).
- [Mobile em destaque](evidence/mobile-highlight-390.jpg) · [final](evidence/mobile-final-390.jpg).
- [Texto 200% em 320 px](evidence/text-zoom-200-320.jpg).
- [Registro animado](evidence/gallery-desktop.gif) · [amostras de fase](evidence/motion-samples.json).
- [Comparação desktop](evidence/comparison-desktop.jpg) · [comparação mobile](evidence/comparison-mobile.jpg).
- [Design QA](../../design-qa.md): final result: passed.
