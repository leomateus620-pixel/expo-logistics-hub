# Prévia local da Equipe Fenasoja

Execute `npx vite --config scripts/workers/preview.vite.config.ts`. Este harness usa identidade, mensagens e serviços sintéticos em `http://127.0.0.1:5188`; não representa uma sessão de produção.

- `/equipe-ia?worker=mapa`: preferência real de movimento e tema claro.
- `/equipe-ia?worker=mapa&theme=dark`: tema escuro da fixture.
- `/equipe-ia?worker=mapa&motion=full`: simula a preferência por movimento completo, exclusivamente neste entrypoint local. A marca “movimento simulado” identifica essa condição.

Use `motion=full` somente para inspecionar movimentos no navegador quando o host de QA declara `prefers-reduced-motion`. Recarregue a página sem esse parâmetro para restaurar a preferência real. Não altera a configuração do sistema. A opção não existe nas rotas nem no bundle da aplicação publicada; o guard exige hostname loopback.

A simulação retorna `false` apenas para a media query de redução de movimento, preservando as demais consultas. Como CSS ainda recebe a preferência real, uma folha inserida apenas pela fixture habilita os três pontos laterais com os mesmos keyframes do produto e somente quando o mascote está ativo. Pausa manual, visibilidade e orçamento de animações continuam valendo.

Na inspeção, conferir a mudança de transformações do SVG e as piscadas entre quadros, os três pontos durante a resposta, sua remoção ao concluir e a pausa manual. Capturas desse modo comprovam o comportamento visual da fixture sob preferência simulada; não comprovam preferência real do usuário ou publicação.
