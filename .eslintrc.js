module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended"],
  plugins: ["@typescript-eslint"],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  rules: {
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": "warn",
  },
  env: {
    node: true,
    es6: true,
  },
  ignorePatterns: ["dist/", "node_modules/", "*.js"],
};
