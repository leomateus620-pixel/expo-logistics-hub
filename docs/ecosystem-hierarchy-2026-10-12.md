# Ecossistema Fenasoja — hierarquia e controles

A apresentação agora coloca CCPF à esquerda e a presidência de Fabiano Soltis à direita, ambos em `y=88`. Djeison Drey aparece centralizado na linha seguinte; a Comissão Central fica abaixo dele. O critério usa tipo de nó e `metadata.executiveRole`, sem comparar nomes para determinar posição ou modificar `authorityLevel`, cargo ou filtro institucional. Ambos os executivos continuam no filtro Presidência.

As raízes têm `parentIds=[]`. A vice-presidência recebe CCPF e presidência como pais; a Central recebe a vice-presidência. `edges` e `childIds` continuam gerados a partir de `parentIds`, inclusive para o destaque de relacionamentos. Não existe linha decorativa nem ligação direta da presidência à Central no cadastro executivo completo. Os fallbacks de cadastros sem vice continuam conectados e sinalizados pelas anomalias existentes, sem inventar uma pessoa.

## Correção restrita da Zélia

Fontes conferidas no repositório:

- `supabase/functions/provision-presidentes-2028/data.ts`: conta da diretoria `74a71a9f-c2a6-4ae1-baed-1e2d7b8bc07f`, na Central, com cargo de Marketing e Comunicação.
- `src/components/cronograma-eventos/personPhotos.ts`: retrato oficial vinculado a essa conta e à conta histórica `38e7e8d3-4c66-4279-92ea-961b70ee4e80`.
- `src/modules/commissions/officialCommissionCatalog.ts`: assessoria de Marketing/Comunicação e sua responsável oficial.
- `useOrgMembers` e `useOrgCommissions`: membros e responsáveis continuam chegando pelas fontes existentes; não houve mudança de consulta.

O resolver omite a segunda identidade **somente do `personIds` apresentado pela Central**, quando a identidade da diretoria também está nessa lista e ambas mantêm o nome auditado. A conta da assessoria, seus cargos, suas fontes e sua classificação institucional continuam no grafo. A legenda contextual da diretoria na Central é `COMISSÃO CENTRAL · MARKETING E COMUNICAÇÃO`; o cargo completo continua em `OrgPerson.roles`. Homônimos com outros IDs permanecem separados. Se a diretoria estiver ausente numa atualização incompleta, a outra entrada é preservada.

Contagem, retratos, lista e seleção usam a mesma lista corrigida. Não há número de integrantes fixado. Os testes cobrem ordem invertida, atualização, identidade renomeada, ausência da diretoria, homônimos e seleção da conta histórica pela assessoria.

## Cabeçalho, espaço e navegação

A marca original FENASOJA 2028 fica ao lado de “Ecossistema”, com estilos limitados às classes deste módulo. A busca, seu estado, resultados, handlers, CSS e tratamento específico de Escape foram removidos. Os seis filtros mantêm textos completos, `aria-pressed` e foco visível; usam 34 px no desktop com ponteiro fino e pelo menos 44 px em interfaces de toque. Em telas estreitas eles quebram em linhas, sem abreviações ou corte dos nomes.

`useOrgViewport` observa a altura real do bloco superior e usa a mesma medida para a câmera e o painel. Atualizações de dados mantêm pan/zoom; mudanças de orientação que alteram a grade reenquadram o conjunto. No celular, as raízes permanecem pares e o enquadramento inicial contém os dois retratos.

Os centros superiores usam `88 / 360 / 590`, com o conjunto inferior iniciando em `810`. O intervalo inferior passou de 184 para 232 unidades: a medição detectou descrições longas atravessando o retrato da linha seguinte após acomodar a nova hierarquia. As colunas, a ordem e os agrupamentos foram preservados. Os conectores mantêm o leque e os corredores entre colunas; suas saídas contornam as legendas e sua aproximação ao retrato evita as descrições da linha anterior.

## Evidência visual e estrutural

Capturas locais em Chromium com a fixture diagnóstica existente, ampliada para reproduzir as duas identidades auditadas da Zélia. Não representam consulta autenticada ao cadastro remoto nem validação de dispositivo físico/iOS. O navegador conectado não carregou sua política de acesso durante esta execução.

Baseline: `8c4dd1214acae2e1dcf68ff981b846bdf23d8b1f`. O script de comparação materializa seus componentes e resolver e usa exatamente a mesma entrada diagnóstica do código atual. A auditoria confirmou igualdade completa das 41 pessoas e dos 33 nós inferiores da fixture, incluindo membros, responsabilidades e metadados. Ordem e colunas são idênticas; a tradução horizontal no celular é apenas a centralização do mundo mais largo. Esses números descrevem a fixture, não limites ou contagens do cadastro. [Auditoria estrutural](evidence/ecosystem-hierarchy/baseline-audit.json).

| Cenário | Antes | Depois |
|---|---|---|
| Desktop 1440×900 | [Captura](evidence/ecosystem-hierarchy/desktop-before.png) | [Captura](evidence/ecosystem-hierarchy/desktop-after.png) |
| Celular 390×844 | [Captura](evidence/ecosystem-hierarchy/mobile-before.png) | [Captura](evidence/ecosystem-hierarchy/mobile-after.png) |
| Paisagem 844×390 | [Captura](evidence/ecosystem-hierarchy/landscape-before.png) | [Captura](evidence/ecosystem-hierarchy/landscape-after.png) |
| Lista da Central | [Captura](evidence/ecosystem-hierarchy/central-before.png) | [Captura](evidence/ecosystem-hierarchy/central-after.png) |

[Tela de 320×740](evidence/ecosystem-hierarchy/narrow-after.png): nenhum rótulo de filtro cortado; título afastado do botão de fechar. [Auditoria](evidence/ecosystem-hierarchy/narrow-audit.json).

A reserva medida termina em 108 px no desktop, 146 px no celular e 96 px em paisagem; a câmera adiciona 12 px. A escala inicial é 0,504 / 0,610 / 0,680 respectivamente. O desktop usa uma escala menor que o baseline para mostrar todos os níveis e dar espaço às legendas. O celular e a paisagem mantêm exploração vertical por pan. A amostragem dos caminhos SVG a cada três unidades encontrou zero cruzamentos com legendas; os retângulos dos cartões não se sobrepõem nos três cenários.

## Validação

- **82 testes passaram**, em 9 arquivos: resolver, layout, controles, painel, interação, dados, retratos, telemetria, contrato de acesso e integração do portal.
- **65 verificações de navegador passaram**: 21 no desktop, 22 no celular e 22 em paisagem. Incluem seis filtros, hierarquia, lista/contagem/seleção, teclado e Home, mouse, roda, pan de toque, pinça, atualização sem salto de câmera, orientação, reabertura, Escape, fechamento do painel/tela cheia e retorno de foco. [Desktop](evidence/ecosystem-hierarchy/desktop-audit.json), [celular](evidence/ecosystem-hierarchy/mobile-audit.json), [paisagem](evidence/ecosystem-hierarchy/landscape-audit.json).
- `npm run typecheck`, `npm run build` e ESLint dos arquivos TypeScript/TSX alterados passaram. O build mantém os avisos existentes de Browserslist e tamanho de chunks.
- `npm run lint` do checkout completo falhou com 3.954 erros e 282 avisos fora dos arquivos verificados deste escopo, incluindo cópias em worktrees locais. Não foi tratado como evidência de lint global aprovado.
- Ampliação para toda a pasta Alvorada revelou a falha preexistente de `AlvoradaBrandHero.test.tsx`: o teste espera `/alvorada/fenasoja-symbol-official.png`, enquanto o componente inalterado usa a URL existente do asset. O teste isolado reproduz a falha. Houve também timeout de 5 s da integração sob carga concorrente; a execução isolada e a execução final pertinente passaram no limite original.

Comandos de reprodução (configure `PLAYWRIGHT_PATH` se Playwright não estiver na resolução local):

```powershell
npx vite --config scripts/alvorada-qa.config.ts --port 4183
npx vitest run src/features/alvorada/organizational src/test/organizationalResolver.test.ts src/test/alvoradaPortalIntegration.test.tsx src/test/alvoradaAccessContract.test.ts
node scripts/check-alvorada-interactions.mjs http://127.0.0.1:4183 artifacts/ecosystem-interactions
node scripts/check-ecosystem-baseline.mjs 8c4dd121 http://127.0.0.1:4183
npm run typecheck
npm run build
```

## Arquivos e limite da intervenção

- `resolver.ts`: relações de apresentação e lista restrita da Central, mantendo os registros de pessoas.
- `organizationalLayout.ts`: linhas explícitas, espaçamento, conectores e navegação entre raízes pares.
- `OrganizationalEcosystem.tsx`, `OrgControls.tsx`, `useOrgGraphInteraction.ts`, `OrganizationalNode.tsx`, `FenasojaEcosystemExperience.tsx`: cabeçalho e remoção integral da busca.
- `useOrgViewport.ts` e `organizational-ecosystem.css`: medida do topo, enquadramento e controles responsivos.
- `PersonDetailPanel.tsx`: legenda contextual da diretoria na Central.
- Testes, harness, scripts e estes anexos: regressões e comparação com o baseline.

Nenhuma alteração em consultas, hooks de autenticação, capabilities, RLS, migrações, arquivos de provisionamento, vínculos ou gravação de banco. Nenhuma conta ou pessoa foi excluída. As fontes institucionais foram somente lidas; a comparação do grafo confirma preservação dos registros. Alterações de terceiros já presentes ou surgidas durante a execução em `package-lock.json`, `supabase/functions/mcp/index.ts` e worktrees foram mantidas fora desta entrega. Não houve deploy ou merge.
