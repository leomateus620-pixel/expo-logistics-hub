

## Problema

O modal "Criar Evento" usa `bg-white/10 backdrop-blur-2xl` no `DialogContent`, o que torna o fundo quase transparente/escuro demais. Os inputs também usam `bg-white/10 border-white/15`, ficando praticamente invisíveis. O texto e placeholders ficam ilegíveis.

## Solução

Trocar o fundo do modal e dos inputs para cores sólidas legíveis, mantendo um toque premium:

- `DialogContent`: `bg-card/95 backdrop-blur-xl border-border` — fundo sólido com leve transparência
- Inputs, Textarea, SelectTrigger: `bg-background/80 border-border` — campos legíveis com contraste adequado
- Labels e texto permanecem com cores padrão do tema

### Arquivo modificado
- `src/pages/AgendaPage.tsx` — linhas 317, 322, 323, 327, 331, 334, 336, 343

