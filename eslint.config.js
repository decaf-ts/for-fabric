import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  {
    ignores: [
      "lib",
      "bin",
      "dist",
      "docs",
      "docker/**/*",
      "gulpfile.js",
      "workdocs",
      "!src/**/*",
      "!tests/**/*",
      "tests/bundling/**/*",
      "tests/web/**/*",
    ],
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // '@typescript-eslint/interface-name-prefix': 'off',
      // '@typescript-eslint/explicit-function-return-type': 'off',
      // '@typescript-eslint/explicit-module-boundary-types': 'off',
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**/*.{js,mjs,cjs,ts}"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/client/indexes/generation.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
