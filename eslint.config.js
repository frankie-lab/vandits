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
);
