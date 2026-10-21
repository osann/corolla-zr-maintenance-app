// Run from the repo root via `npm run lint` in backend/ — it lints the frontend too.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '_site/**'] },

  // Best-effort `try { … } catch {}` is used deliberately (storage, sync, JSON parsing).
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },

  // Backend (Node, TypeScript)
  {
    files: ['backend/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Frontend ES modules (functions called from inline on*= handlers are exposed in js/main.js)
  {
    files: ['js/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'module', globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },

  // Cloudflare Worker (module syntax, service-worker globals)
  {
    files: ['cloudflare/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'module', globals: globals.serviceworker },
  },

  // This config file itself
  {
    files: ['backend/eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
