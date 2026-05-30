export const modularDesignTokens = {
  surfaces: {
    primary: 'surface-primary',
    secondary: 'surface-secondary',
    glassCard: 'liquid-glass-card',
    glassPanel: 'glass-panel',
    premium: 'premium-surface',
  },
  motion: {
    lift: 'interactive-lift',
    softRise: 'animate-soft-rise',
    portalEnter: 'portal-card-enter',
  },
  emphasis: {
    goldOutline: 'gold-outline',
    premiumShadow: 'premium-shadow',
    focusRing: 'focus-ring',
  },
  text: {
    heading: 'heading-text',
    muted: 'muted-text',
  },
} as const;

export type ModularDesignTokenGroup = keyof typeof modularDesignTokens;
