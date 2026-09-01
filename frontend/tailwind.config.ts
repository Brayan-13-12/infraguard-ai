import type { Config } from "tailwindcss";

/** Wrap a token so Tailwind's alpha slot (`bg-surface/50`) works. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        surface: {
          DEFAULT: token("surface"),
          elevated: token("surface-elevated"),
        },
        border: token("border"),
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        primary: {
          DEFAULT: token("primary"),
          hover: token("primary-hover"),
          foreground: token("primary-foreground"),
        },
        success: token("success"),
        warning: token("warning"),
        caution: token("caution"),
        danger: token("danger"),
        ring: token("ring"),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        xs: "0 1px 2px 0 hsl(var(--shadow-color) / 0.06)",
        sm: "0 1px 3px 0 hsl(var(--shadow-color) / 0.08), 0 1px 2px -1px hsl(var(--shadow-color) / 0.08)",
        md: "0 4px 12px -2px hsl(var(--shadow-color) / 0.10), 0 2px 6px -2px hsl(var(--shadow-color) / 0.08)",
        lg: "0 12px 32px -8px hsl(var(--shadow-color) / 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        // Reusable entrance/interaction motion. Keep durations in the 150-260ms
        // band; every animated element also carries `motion-reduce:animate-none`
        // (and the global reduced-motion rule in globals.css is the backstop).
        "fade-in": "fade-in 150ms ease-out",
        "fade-in-up": "fade-in-up 240ms ease-out both",
        "scale-in": "scale-in 180ms ease-out both",
        "slide-in-left": "slide-in-left 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
