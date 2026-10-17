import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".netlify/**",
      ".cache/**",
      ".data/**",
      ".next/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // These expressions deliberately reject control characters in user input.
  {
    files: [
      "src/shared/aliases.ts",
      "src/server/url.ts",
      "src/server/links.ts",
    ],
    rules: { "no-control-regex": "off" },
  },
);
