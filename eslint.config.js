import globals from "globals";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.mocha,
        chrome: "readonly",
      },
    },
    rules: {},
  },
  {
    files: ["**/*.ts"],
    ignores: ["node_modules/**"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {},
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/models/**", "src/scrapers/**"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "Use schema interfaces from src/models; avoid ad-hoc interfaces.",
        },
      ],
    },
  },
];
