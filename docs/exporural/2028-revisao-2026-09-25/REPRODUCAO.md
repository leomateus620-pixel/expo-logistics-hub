# Reprodução local da Exporural 2028

Nenhuma alteração foi aplicada ao Supabase pelo Codex.

Executar na raiz do repositório, na branch `codex/exporural-2028-revisao`. As dependências npm do projeto já estavam presentes. Não usar o servidor padrão conectado ao Supabase para demonstrar esta proposta.

```powershell
npm run preview:exporural
```

Abrir `http://127.0.0.1:5198/scripts/exporural/preview.html?scope=commission` para a Exporural, `?scope=full` para os componentes da rota completa e `?scope=full&webgl=unavailable` para o fallback acessível. O botão alterna a referência antiga e a proposta. O servidor é restrito a 127.0.0.1; o stub Supabase falha em qualquer operação de dados. Nenhuma credencial é necessária. A aplicação pública não importa esta entrada.

## Reconstrução determinística dos artefatos

Foi utilizado Python 3.12 do runtime do Codex, com numpy/Pillow disponíveis e opencv-python-headless 5.0.0.93, shapely 2.1.2 e pglast 8.4 em `.codex-tmp/exporural-python` (dependências locais de QA, não da aplicação).

```powershell
$py='C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $py -m pip install --no-deps --target .codex-tmp/exporural-python opencv-python-headless==5.0.0.93 shapely==2.1.2 pglast==8.4
npx vite-node --config scripts/exporural/preview.vite.config.ts scripts/exporural/export-baseline.ts
& $py scripts/exporural/build_revision.py docs/exporural/2028-revisao-2026-09-25/fontes
npx vite-node --config scripts/exporural/preview.vite.config.ts scripts/exporural/inspect-preview.ts
& $py scripts/exporural/plot_evidence.py
& $py scripts/exporural/build_sql_payload.py
& $py scripts/exporural/check_sql.py
```

O último gerador de payload, sem argumentos, recria o formulário PENDENTE. Nunca executá-lo por cima de uma resolução preenchida sem guardar cópia. Para montar o SQL a partir de uma resolução autorizada, usar:

```powershell
& $py scripts/exporural/build_sql_payload.py --approved caminho/approvals_aprovadas.json
```

Esse modo confere os 110 destinos, revisão, áreas e coordenadas contra os artefatos canônicos, sem escrever no banco. Mudança cartográfica exige outra revisão e nova geração/validação. `payload_preview.json` contém IDs sintéticos e NÃO é entrada de migração.

## Verificações executáveis

```powershell
npm run typecheck
npx eslint src/features/commercial-map/CommercialMapPage.tsx src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx src/features/commercial-map/components/canvas/PublicLotNumbers.tsx src/features/commercial-map/data/exporuralReference2028.ts src/features/commercial-map/hooks/useExporuralRevisionSelection.ts src/features/commercial-map/utils/exporuralRevisionSelection.ts src/features/commercial-map/utils/exporuralRevisionPresentation.ts src/features/commercial-map/utils/exporuralLandscape.ts src/test/exporural2028Revision.test.ts
npx vitest run src/test/exporural2028Revision.test.ts src/test/commercialMapExporuralLandscape.test.ts --maxWorkers=1 --testTimeout=60000
npm run build -- --manifest
```

O plugin MCP do build padrão reescreve um arquivo gerado de função; esse efeito foi revisado e excluído desta entrega. Não restaurar alterações alheias automaticamente em outro checkout. O preview específico omite esse plugin.

Para repetir as capturas usando o Chromium instalado, com o servidor local ativo:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
& 'C:/Users/Leonardo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' scripts/exporural/browser-evidence.cjs
```

O ensaio bloqueia todas as origens externas, move a câmera existente apenas pelo harness local, registra seis pares de screenshots, clique R-56, revisão/seleção, perda/recuperação WebGL, viewport mobile e fallback. Não comprova acesso real autenticado por comissão nem dispositivo físico.

## Banco

Nenhum SQL foi executado em PostgreSQL. Docker/psql não estavam disponíveis. O parser confirma sintaxe SQL/PLpgSQL, sem resolver permissões, schema, triggers, concorrência ou efeitos. Seguir `TESTES_DE_BANCO_PENDENTES.md` em banco isolado com dados fictícios antes da aplicação autorizada. Executar apenas `preflight.sql` inicialmente no projeto vivo confirmado.
