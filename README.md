# Expo Logistics Hub — Fenasoja 2028

Sistema web operacional da Comissão de Logística da Fenasoja 2028. A aplicação reúne dashboard, transportes, frota, carrinhos, patinetes, hóspedes, agenda, mapa comercial, cronograma e relatórios, preservando as rotas, permissões, integrações e regras de negócio existentes.

## Requisitos

- Node.js 20 ou superior;
- npm;
- acesso às variáveis públicas do projeto Supabase.

Crie o arquivo de ambiente local sem versionar credenciais:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Desenvolvimento local

```powershell
npm.cmd install
npm.cmd run dev
```

O servidor Vite informa a URL local no terminal. A autenticação e os dados continuam usando a integração Supabase configurada pelo projeto; não há dados mockados para substituir uma sessão indisponível.

## Validação

```powershell
npx.cmd tsc -p tsconfig.app.json --noEmit
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

O lint global contém dívida histórica conhecida. Em mudanças focadas, compare a contagem global com a linha de base e valide separadamente os arquivos alterados.

## Arquitetura visual 2028

- Tokens canônicos: `src/styles/tokens.css`;
- constantes de marca para TypeScript, PDF e canvas: `src/lib/fenasoja-brand.ts`;
- lockup vetorial: `src/components/brand/FenasojaBrand.tsx`;
- regras e matriz de aceite: [`docs/FENASOJA_2028_DESIGN_SYSTEM.md`](docs/FENASOJA_2028_DESIGN_SYSTEM.md).

Referências históricas de 2026 continuam válidas quando representam dados, datas, migrations, o ciclo 2026–2028 ou a proveniência oficial do mapa. A apresentação corrente do produto usa Fenasoja 2028.

## Produção

Gere o artefato com `npm.cmd run build` e publique o diretório `dist` pelo pipeline já adotado pelo repositório. Variáveis de ambiente e políticas Supabase devem ser configuradas no ambiente de destino; nunca inclua chaves ou credenciais no código ou na documentação.
