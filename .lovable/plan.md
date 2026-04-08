

# Adicionar grãos de soja caindo na Splash Screen 3D

## Visão geral

Substituir as partículas douradas genéricas por **grãos de soja realistas caindo de cima** durante os 3 segundos da animação. Os grãos terão formato oval característico da soja, cor dourada/amarelada com gradiente realista, sombra, e rotação 3D enquanto caem — criando o efeito de "chuva de soja" sobre o fundo verde escuro.

## Implementação

### 1. `src/components/SplashScreen.tsx`

- Aumentar de 6 para **~20-25 grãos** de soja com propriedades randomizadas:
  - `left`: posição horizontal (0-100%)
  - `delay`: escalonado entre 0-2s
  - `duration`: velocidade de queda (1.5-3.5s)
  - `size`: tamanho variado (12-28px) para simular profundidade
  - `rotateStart` / `rotateEnd`: ângulo de rotação 3D aleatório
  - `swayAmount`: oscilação lateral durante a queda
- Cada grão será um `<div>` com classe `.soybean-grain` em vez de `.splash-particle`
- Os grãos caem de **cima para baixo** (top: -5% → bottom: 110%)
- Manter o card 3D e o shine inalterados

### 2. `src/index.css`

**Novo estilo `.soybean-grain`:**
- Formato oval (border-radius elíptico ~50% 50% 45% 55%)
- Gradiente radial realista simulando volume 3D do grão (amarelo dourado claro no centro, dourado mais escuro nas bordas, com highlight branco sutil no topo-esquerda)
- Box-shadow suave para profundidade
- Pseudo-element `::after` para o "hilum" (marca escura característica do grão de soja)

**Nova keyframe `@keyframes soybean-fall`:**
- Queda vertical suave de cima para baixo
- Rotação 3D contínua (rotateX + rotateZ) durante a queda
- Oscilação lateral sutil (translateX senoidal via waypoints)
- Fade-in no início, fade-out ao sair da tela
- Variação de escala para simular aproximação/afastamento

**Remover** o antigo `splash-particle-drift` e `.splash-particle` (substituídos pelos grãos).

### Resultado visual

- Fundo verde escuro com dezenas de grãos de soja dourados caindo naturalmente
- Cada grão rota em 3D enquanto cai, simulando gravidade realista
- Card 3D da Fenasoja fica no centro com os grãos passando ao redor
- Efeito remete diretamente à colheita de soja de Santa Rosa

## Arquivos

| Arquivo | Ação |
|---|---|
| `src/components/SplashScreen.tsx` | Trocar partículas por grãos de soja com propriedades realistas |
| `src/index.css` | Adicionar `.soybean-grain` + `@keyframes soybean-fall`, remover partículas antigas |

