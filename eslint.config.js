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
      // Frente 1 — domain boundaries.
      // These shims still exist for backward compatibility but new code MUST
      // import from the domain barrel instead. Kept as `warn` (not error) so
      // the migration can proceed file-by-file without breaking the build.
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "@/hooks/use-auth",
                "@/hooks/use-routes",
                "@/hooks/use-route-calculation",
                "@/hooks/use-route-stops",
                "@/hooks/use-travel-advisor",
                "@/hooks/use-realtime-locations",
                "@/hooks/use-database-sync",
                "@/hooks/use-social-stats",
                "@/hooks/use-permissions",
              ],
              message:
                "Import from the domain barrel instead (e.g. '@/domains/identity', '@/domains/routes', '@/domains/content', '@/domains/social'). The '@/hooks/use-*' shims are deprecated.",
            },
            {
              group: ["@/store/locations-store"],
              message:
                "Import from '@/domains/content' instead. The '@/store/locations-store' shim is deprecated.",
            },
          ],
        },
      ],
    },
  },
  {
    // Allow the shim files themselves and infra files to keep their re-exports.
    files: [
      "src/hooks/use-*.ts",
      "src/store/**/*.ts",
      "src/domains/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
