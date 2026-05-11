import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Frente 1 — domain boundaries (now enforced).
      // The hook/store shims have been removed; enforce that all imports
      // go through the domain barrels so we don't grow new shims by mistake.
      // `use-layer-visibility` and `use-resolved-map-features` are
      // intentionally NOT routed through a domain barrel — they are the
      // frozen map-visibility singleton (see ADR 001) and may be imported
      // directly from `@/hooks/`.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/hooks/use-auth",
                "@/hooks/use-routes",
                "@/hooks/use-route-calculation",
                "@/hooks/use-route-stops",
                "@/hooks/use-travel-advisor",
                "@/hooks/use-database-sync",
                "@/hooks/use-social-stats",
                "@/hooks/use-permissions",
              ],
              message:
                "Import from the domain barrel instead (e.g. '@/domains/identity', '@/domains/routes', '@/domains/content', '@/domains/social').",
            },
            {
              group: ["@/store/locations-store"],
              message:
                "Import from '@/domains/content' instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Internal modules (domains, hooks implementations, tests) are exempt
    // so they can talk to the canonical implementation paths directly.
    files: [
      "src/hooks/**/*.ts",
      "src/store/**/*.ts",
      "src/domains/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  // ── Design-system guard rails (warn-only) ──────────────────────────────
  // Nudge the codebase toward semantic tokens defined in
  // src/shared/styles/tokens/*.css. Warnings (not errors) so they catch
  // regressions without blocking CI while migration is in flight.
  // Excludes: shadcn primitives (src/components/ui), tests.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "Avoid hardcoded hex colors. Use semantic HSL tokens (bg-primary, text-foreground, hsl(var(--*))). See src/shared/styles/tokens/.",
        },
        {
          selector: "Literal[value=/^z-\\[\\d+\\]$/]",
          message:
            "Avoid arbitrary z-index values. Use the named scale: z-modal, z-popover, z-toast. See src/shared/styles/tokens/z-index.css.",
        },
        {
          selector:
            "Literal[value=/(?:^|\\s)(?:bg|text|border)-(?:white|black|gray-\\d+|slate-\\d+|zinc-\\d+|neutral-\\d+|stone-\\d+)(?:\\s|$)/]",
          message:
            "Use semantic tokens (bg-card / bg-background / text-foreground / text-muted-foreground) instead of bg-white/bg-gray-*/text-black.",
        },
      ],
    },
  },
);
