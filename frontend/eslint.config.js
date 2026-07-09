import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    // On ignore le dossier de build et les rapports
    ignores: ["dist/**", "eslint-results.sarif"],
  },
  js.configs.recommended, // Reprend les règles de base d'ESLint
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Tu peux remettre tes règles personnalisées ici, par exemple :
      "react/react-in-jsx-scope": "off", // Inutile avec Vite/React 17+
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];