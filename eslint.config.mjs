import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const palette = "(bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|caret|shadow)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}";
const paletteMessage = "Use a theme token (text-destructive, text-income, text-warning, text-accent-2, text-primary, text-muted-foreground…), not a raw Tailwind palette colour.";
const paletteSelectors = [
  { selector: `Literal[value=/\b${palette}\b/]`, message: paletteMessage },
  { selector: `TemplateElement[value.raw=/\b${palette}\b/]`, message: paletteMessage },
];
const RAW = "button|input|select|textarea|table|thead|tbody|tfoot|tr|td|th|dialog|label|progress|details|summary|hr|option|optgroup|fieldset|legend";
const rawControlSelectors = [
  {
    selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^(${RAW})$/]`,
    message: "Use the shadcn component from @/components/ui (Button, Input, Select, Textarea, Table, Dialog, Label, Progress, Collapsible, Separator…), not a raw HTML control.",
  },
];

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
  // UI discipline (UX pass, 13 Nov 2026):
  //  1. Colours come from the theme tokens (destructive, income, warning, accent-2,
  //     primary, muted-foreground…), never raw Tailwind palette classes such as
  //     text-rose-500 or bg-blue-50: the app is dark-only and every colour has a meaning.
  //  2. Every interactive or form control comes from shadcn (src/components/ui).
  //     Raw <button>, <input>, <select>, <textarea>, <table>, <dialog> … are only
  //     allowed inside src/components/ui itself.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...paletteSelectors, ...rawControlSelectors],
    },
  },
  {
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...paletteSelectors],
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
