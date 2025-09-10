import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "**/*.ts", "extension/**"],
  },
  {
    files: ["**/*.js"],
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
];
