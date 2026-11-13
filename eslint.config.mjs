import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Honor the `_` prefix convention for intentionally-unused vars/args.
  // Lets you keep a param for API-contract reasons (or destructure-and-discard
  // a field) without triggering @typescript-eslint/no-unused-vars.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Colours come from the theme tokens (destructive, income, warning, accent-2,
  // primary, muted-foreground…), never raw Tailwind palette classes such as
  // text-rose-500 or bg-blue-50: the app is dark-only and every colour has a
  // meaning (UX pass rule, 13 Nov 2026). Applies to class strings in UI code.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\b(bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\\b/]",
          message: "Use a theme token (text-destructive, text-income, text-warning, text-accent-2, text-primary, text-muted-foreground…), not a raw Tailwind palette colour.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b(bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\\b/]",
          message: "Use a theme token (text-destructive, text-income, text-warning, text-accent-2, text-primary, text-muted-foreground…), not a raw Tailwind palette colour.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated files:
    "public/sw.js",
    ".open-next/**",
    "worker.ts",
  ]),
]);

export default eslintConfig;
