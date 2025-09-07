import globals from "globals";

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
];
