export const modularDesignTokens = {
  surfaces: {
    primary: 'surface-primary',
    secondary: 'surface-secondary',
    glassCard: 'liquid-glass-card',
    glassPanel: 'glass-panel',
    premium: 'premium-surface',
  },
  elevation: {
    base: 'elevation-0',
    grouped: 'elevation-1',
    selected: 'elevation-2',
    floating: 'elevation-3',
    overlay: 'elevation-4',
  },
  motion: {
    lift: 'interactive-lift',
    press: 'interaction-press',
    softRise: 'animate-soft-rise',
    portalEnter: 'portal-card-enter',
    routeEnter: 'route-soft-enter',
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
