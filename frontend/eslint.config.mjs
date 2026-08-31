import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  // Next.js recommended rules (Core Web Vitals) + TypeScript rules, loaded from
  // the legacy shareable configs via the flat-config compatibility shim.
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
