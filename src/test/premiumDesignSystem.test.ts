import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(resolve('src/styles/tokens.css'), 'utf8');
const globalStyles = readFileSync(resolve('src/index.css'), 'utf8');
const workspaceStyles = readFileSync(resolve('src/styles/cronograma-workspace.css'), 'utf8');
const mobileStyles = readFileSync(resolve('src/styles/cronograma-mobile.css'), 'utf8');
const mobileOverlayStyles = readFileSync(resolve('src/styles/cronograma-mobile-overlays.css'), 'utf8');
const countdownStyles = readFileSync(resolve('src/styles/fenasoja-countdown.css'), 'utf8');
const loginStyles = readFileSync(resolve('src/styles/login-experience.css'), 'utf8');

describe('arquitetura visual premium Fenasoja 2028', () => {
  it('mantém a hierarquia semântica de elevação zero a quatro', () => {
    for (let level = 0; level <= 4; level += 1) {
      expect(tokens).toContain(`--elevation-${level}:`);
      expect(globalStyles).toContain(`.elevation-${level}`);
    }
  });

  it('centraliza vidro, interação e movimento com redução de efeitos', () => {
    expect(tokens).toContain('--glass-surface:');
    expect(tokens).toContain('--glass-blur-panel:');
    expect(tokens).toContain('--motion-structural:');
    expect(tokens).toContain('--interaction-press-scale:');
    expect(globalStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(globalStyles).toContain('@supports not ((backdrop-filter: blur(1px))');
  });

  it('não volta a desativar blur semanticamente em toda a aplicação', () => {
    expect(globalStyles).not.toMatch(/\[class\*=["']backdrop-blur["']\][\s\S]{0,120}backdrop-filter:\s*none\s*!important/);
  });

  it('adapta o workspace conectado à paleta sem reintroduzir hex verde legado', () => {
    expect(workspaceStyles).not.toMatch(/#(?:0f6b3b|0a4329|16834b|12291d)/i);
    expect(workspaceStyles).toContain('oklch(var(--brand-navy-900))');
    expect(workspaceStyles).toContain('oklch(var(--primary))');
  });

  it('mantem verde apenas semantico no Cronograma movel e reutiliza tokens nos overlays', () => {
    expect(mobileStyles).not.toMatch(/hsl\(14[0-9]/i);
    expect(mobileStyles).not.toMatch(/#(?:0f6b3b|0a4329|16834b|12291d)/i);
    expect(mobileOverlayStyles).not.toMatch(/rgb\(\s*(?:2|3|4|8)\s+(?:25|28|31|44)\s+(?:13|16|25)/i);
    expect(mobileOverlayStyles).toContain('var(--elevation-4)');
    expect(mobileOverlayStyles).toContain('var(--motion-base)');
    expect(mobileOverlayStyles).toContain('var(--destructive)');
  });

  it('adapta o countdown ao navy 2028 sem animacao decorativa continua', () => {
    expect(countdownStyles).toContain('--fenasoja-hero-deep: 213 89% 11%');
    expect(countdownStyles).toContain('var(--elevation-4)');
    expect(countdownStyles).toContain('var(--motion-structural)');
    expect(countdownStyles).toContain('-webkit-text-fill-color: currentColor');
    expect(countdownStyles).not.toContain('-webkit-text-fill-color: transparent');
    expect(countdownStyles).not.toContain('will-change: opacity, transform');
    expect(countdownStyles).not.toMatch(/@keyframes fenasoja-number-change[\s\S]*?filter:/);
    expect(countdownStyles).not.toMatch(/hsl\(14[0-9]/i);
    expect(countdownStyles).not.toMatch(/animation:[^;]*infinite/i);
  });

  it('mantém o login no sistema visual compartilhado com estados e fallbacks completos', () => {
    expect(loginStyles).toContain('oklch(var(--brand-navy-900))');
    expect(loginStyles).toContain('oklch(var(--brand-orange-500))');
    expect(loginStyles).toContain('var(--motion-structural)');
    expect(loginStyles).toContain('.auth-input-frame[data-invalid=\'true\']');
    expect(loginStyles).toContain('.auth-input-control:-webkit-autofill');
    expect(loginStyles).toContain('0 0 0 3px oklch(var(--focus-ring))');
    expect(loginStyles).toContain('0 0 0 3px oklch(var(--semantic-red-700))');
    expect(loginStyles).toContain('@supports not ((backdrop-filter: blur(1px))');
    expect(loginStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(loginStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(loginStyles).not.toMatch(/animation:[^;]*infinite/i);
    expect(globalStyles).not.toContain('.auth-glass-panel');
    expect(globalStyles).not.toContain('.auth-primary-action');
  });
});
