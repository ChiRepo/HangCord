// Flat ESLint config for the whole monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/target/**",
      "apps/desktop/src-tauri/gen/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "ui-ux/**",
      "Private files (.md files store here)/**",
      "private and only to be accessed once*/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Secrets and plain user data must never be logged (MASTER_PLAN §12, SECRETS_AND_SENSITIVE_DATA.md).
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Math.random() is never allowed for anything security-related (MASTER_PLAN §6.1).
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use crypto.getRandomValues — Math.random() is banned in HangCord." },
      ],
    },
  },
);
