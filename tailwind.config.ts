import type { Config } from "tailwindcss";

const tokenColor = (token: string) => `oklch(var(--${token}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: tokenColor("border"),
        input: tokenColor("input"),
        ring: tokenColor("ring"),
        background: tokenColor("background"),
        foreground: tokenColor("foreground"),
        primary: {
          DEFAULT: tokenColor("primary"),
          foreground: tokenColor("primary-foreground"),
        },
        action: {
          DEFAULT: tokenColor("action"),
          foreground: tokenColor("action-foreground"),
        },
        secondary: {
          DEFAULT: tokenColor("secondary"),
          foreground: tokenColor("secondary-foreground"),
        },
        destructive: {
          DEFAULT: tokenColor("destructive"),
          foreground: tokenColor("destructive-foreground"),
        },
        muted: {
          DEFAULT: tokenColor("muted"),
          foreground: tokenColor("muted-foreground"),
        },
        accent: {
          DEFAULT: tokenColor("accent"),
          foreground: tokenColor("accent-foreground"),
        },
        popover: {
          DEFAULT: tokenColor("popover"),
          foreground: tokenColor("popover-foreground"),
        },
        card: {
          DEFAULT: tokenColor("card"),
          foreground: tokenColor("card-foreground"),
        },
        success: {
          DEFAULT: tokenColor("success"),
          foreground: tokenColor("success-foreground"),
        },
        warning: {
          DEFAULT: tokenColor("warning"),
          foreground: tokenColor("warning-foreground"),
        },
        info: {
          DEFAULT: tokenColor("info"),
          foreground: tokenColor("info-foreground"),
        },
        gold: {
          DEFAULT: tokenColor("gold"),
          foreground: tokenColor("gold-foreground"),
        },
        cream: {
          DEFAULT: tokenColor("cream"),
          foreground: tokenColor("cream-foreground"),
        },
        sidebar: {
          DEFAULT: tokenColor("sidebar-background"),
          foreground: tokenColor("sidebar-foreground"),
          primary: tokenColor("sidebar-primary"),
          "primary-foreground": tokenColor("sidebar-primary-foreground"),
          accent: tokenColor("sidebar-accent"),
          "accent-foreground": tokenColor("sidebar-accent-foreground"),
          border: tokenColor("sidebar-border"),
          ring: tokenColor("sidebar-ring"),
        },
        brand: {
          indigo: tokenColor("brand-indigo-500"),
          navy: tokenColor("brand-navy-900"),
          nearblack: tokenColor("brand-navy-950"),
          orange: tokenColor("brand-orange-500"),
          gold: tokenColor("brand-gold-500"),
          green: tokenColor("brand-green"),
          blue: tokenColor("brand-blue"),
          cream: tokenColor("brand-cream"),
          white: tokenColor("brand-soft-white"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "card-enter-3d": {
          "0%": { opacity: "0", transform: "translateY(24px) rotateX(-8deg) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) rotateX(0) scale(1)" },
        },
        "shimmer-diagonal": {
          "0%": { transform: "translateX(-120%) skewX(-20deg)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateX(220%) skewX(-20deg)", opacity: "0" },
        },
        "gold-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 oklch(var(--gold) / 0.45), 0 8px 22px -10px oklch(var(--gold) / 0.4)" },
          "50%": { boxShadow: "0 0 0 6px oklch(var(--gold) / 0), 0 12px 30px -10px oklch(var(--gold) / 0.55)" },
        },
        "icon-spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "icon-glide": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(2px)" },
        },
        "cart-shimmer": {
          "0%": { transform: "translateX(-120%) skewX(-18deg)", opacity: "0" },
          "20%": { opacity: "1" },
          "60%": { opacity: "1" },
          "100%": { transform: "translateX(220%) skewX(-18deg)", opacity: "0" },
        },
        "halo-breath": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.08)" },
        },
        "recipient-rise": {
          "0%":   { opacity: "0", transform: "translateY(80px) rotateX(-15deg) scale(0.9)" },
          "60%":  { opacity: "1", transform: "translateY(-6px) rotateX(2deg) scale(1.02)" },
          "100%": { opacity: "1", transform: "translateY(0) rotateX(0) scale(1)" },
        },
        "gold-shimmer": {
          "0%": { transform: "translateX(-150%) skewX(-20deg)", opacity: "0" },
          "30%": { opacity: "0.9" },
          "100%": { transform: "translateX(220%) skewX(-20deg)", opacity: "0" },
        },
        "floating-bar-in": {
          "0%": { opacity: "0", transform: "translateY(-12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-soft": "none",
        "shimmer": "none",
        "float": "none",
        "card-enter-3d": "none",
        "shimmer-diagonal": "none",
        "gold-pulse": "none",
        "icon-spin-slow": "none",
        "icon-glide": "none",
        "cart-shimmer": "none",
        "halo-breath": "none",
        "recipient-rise": "none",
        "gold-shimmer": "none",
        "floating-bar-in": "floating-bar-in 220ms cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
