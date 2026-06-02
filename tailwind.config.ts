import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.5rem",
        md: "2.5rem",
        lg: "4rem",
        xl: "5.5rem",
        "2xl": "7rem",
      },
      // No max-width caps — container spans the full viewport (edge to edge).
      screens: {},
    },
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        subtle: "hsl(var(--subtle) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        faint: "hsl(var(--faint) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        gold: "hsl(var(--gold) / <alpha-value>)",
        "gold-soft": "hsl(var(--gold-soft) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      fontSize: {
        "display-lg": ["clamp(2.75rem, 6.5vw, 5.25rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        "display": ["clamp(2.25rem, 5vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "heading": ["clamp(1.9rem, 3.6vw, 3rem)", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        "quote": ["clamp(1.9rem, 4.4vw, 3.6rem)", { lineHeight: "1.18", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      maxWidth: {
        prose: "62ch",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(38,32,26,0.04), 0 6px 16px -8px rgba(38,32,26,0.10), 0 18px 40px -20px rgba(38,32,26,0.12)",
        lift: "0 2px 4px rgba(38,32,26,0.05), 0 14px 30px -10px rgba(38,32,26,0.14), 0 40px 80px -32px rgba(38,32,26,0.22)",
        glow: "var(--shadow-float)",
        "inset-top": "inset 0 1px 0 0 hsl(0 0% 100% / 0.9)",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-14px,0)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(0,-22px,0) scale(1.04)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.82)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-slow": "floatSlow 11s ease-in-out infinite",
        "pulse-dot": "pulseDot 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
