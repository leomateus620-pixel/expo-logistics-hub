## Diagnóstico confirmado

No domínio publicado (`fenasojalog.com`) a tela fica presa no spinner inicial porque o JavaScript quebra antes de renderizar o React:

```text
ReferenceError: Cannot access 'S' before initialization
assets/charts-BO9nWlws.js
```

Isso vem do chunk manual `charts` gerado pelo Vite/Rollup para `recharts`/`d3-*`. Como esse chunk está sendo `modulepreload` no HTML publicado, ele executa antes mesmo da tela de login e derruba o app inteiro no Safari/Chrome mobile.

## Plano de correção

1. **Corrigir o bundle publicado**
   - Ajustar `vite.config.ts` para remover o chunk manual `charts` de `recharts`/`d3-*`.
   - Deixar o Vite dividir esses módulos automaticamente junto dos componentes lazy da Dashboard, evitando o erro de inicialização circular/TDZ.
   - Manter os chunks manuais seguros (`react-vendor`, `data-vendor`, `pdf`, mapas, QR, Radix).

2. **Blindar a inicialização do app**
   - Atualizar `src/main.tsx` para detectar também erros do tipo `Cannot access ... before initialization` quando vierem de assets/chunks.
   - Trocar acessos diretos a `sessionStorage` por helpers seguros com `try/catch`, evitando que modo privado/iOS bloqueie a recuperação.
   - Manter a limpeza automática de cache/Service Worker com apenas uma tentativa por sessão.

3. **Reduzir risco antes do login**
   - Revisar `App.tsx` para tornar o persister de `localStorage` tolerante a falhas em Safari/iOS.
   - Evitar que indisponibilidade de storage impeça renderização do login.

4. **Validar antes de concluir**
   - Testar no preview mobile.
   - Testar o domínio publicado/ambiente equivalente depois da correção, verificando console e rede.
   - Confirmar que a tela de login aparece e que não há mais erro fatal de `charts-*.js`.

## Resultado esperado

- O login abre no mobile sem ficar preso no spinner verde.
- A Dashboard continua com gráficos premium, mas os gráficos só carregam quando a rota autenticada precisar deles.
- Usuários com cache antigo recebem recuperação automática sem quebrar a entrada.