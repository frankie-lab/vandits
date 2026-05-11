import type { Config } from "tailwindcss";

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
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'token-xs': 'var(--radius-xs)',
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',
      },
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'soft': 'var(--shadow-sm)',
        'medium': 'var(--shadow-md)',
        'large': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
      },
      // ── Design-system tokens exposed as Tailwind utilities ─────────────
      // (z-index / typography / density / motion). Wired from
      // src/shared/styles/tokens/*.css through CSS variables.
      zIndex: {
        base: 'var(--z-base)',
        map: 'var(--z-map)',
        'map-overlay': 'var(--z-map-overlay)',
        toolbar: 'var(--z-toolbar)',
        'toolbar-raised': 'var(--z-toolbar-raised)',
        popover: 'var(--z-popover)',
        modal: 'var(--z-modal)',
        'modal-nested': 'var(--z-modal-nested)',
        'modal-top': 'var(--z-modal-top)',
        toast: 'var(--z-toast)',
        'progress-bar': 'var(--z-progress-bar)',
        'modal-import': 'var(--z-modal-import)',
        max: 'var(--z-max)',
      },
      fontSize: {
        'h1': ['var(--text-h1)', { lineHeight: 'var(--lh-h1)', letterSpacing: '-0.01em' }],
        'h2': ['var(--text-h2)', { lineHeight: 'var(--lh-h2)', letterSpacing: '-0.005em' }],
        'h3': ['var(--text-h3)', { lineHeight: 'var(--lh-h3)' }],
        'h4': ['var(--text-h4)', { lineHeight: 'var(--lh-h4)' }],
        'body': ['var(--text-body)', { lineHeight: 'var(--lh-body)' }],
        'caption': ['var(--text-caption)', { lineHeight: 'var(--lh-caption)', letterSpacing: '0.005em' }],
        'micro': ['var(--text-micro)', { lineHeight: 'var(--lh-micro)', letterSpacing: '0.01em' }],
      },
      height: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)',
        'control-xl': 'var(--control-h-xl)',
      },
      width: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)',
        'control-xl': 'var(--control-h-xl)',
      },
      minHeight: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)',
        'control-xl': 'var(--control-h-xl)',
      },
      transitionDuration: {
        instant: 'var(--dur-instant)',
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
        xslow: 'var(--dur-xslow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        decel: 'var(--ease-decel)',
        accel: 'var(--ease-accel)',
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
          "50%": { opacity: "0.7" },
        },
        "shimmer": {
          "0%, 100%": { backgroundColor: "hsl(var(--muted))" },
          "50%": { backgroundColor: "hsl(var(--muted) / 0.5)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "shimmer": "shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;