import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "apps/web/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
