// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'drizzle/**', '.dev-data/**', 'node_modules/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module'
      }
    }
  },
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      '*.config.{ts,js}',
      'scripts/**/*.{mjs,mts}'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['src/renderer/**/*.{ts,vue}'],
    languageOptions: {
      // `__APP_VERSION__` lo inyecta el bundler (`define` en
      // electron.vite.config.ts, replicado en vitest.config.ts): no hay módulo
      // del que importarlo.
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' }
    }
  },
  {
    files: ['**/*.test.ts', 'vitest.setup.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    rules: {
      // El chequeo de tipos real lo hace `pnpm typecheck` (tsc/vue-tsc contra
      // los dos tsconfig), no los rule sets type-aware de ESLint, que exigirían
      // un único `parserOptions.project` para todos los contextos.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' }
      ],
      'vue/multi-word-component-names': 'off'
    }
  },
  eslintConfigPrettier
);
