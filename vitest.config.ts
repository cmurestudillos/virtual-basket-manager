import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Réplica del `define` de `electron.vite.config.ts`, para que los componentes
// que pintan la versión rendericen bajo test el mismo valor que en la build.
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')
) as {
  version: string;
};

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      '@main': resolve(import.meta.dirname, 'src/main'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
      '@shared': resolve(import.meta.dirname, 'src/shared')
    }
  },
  test: {
    globals: true,
    // Entorno por defecto 'node' (proceso principal y shared); los tests del
    // renderer piden jsdom uno a uno con un docblock @vitest-environment.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules/**', 'out/**', 'dist/**', '.dev-data/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // El código de arranque y cableado queda fuera de la puerta de cobertura:
      // no tiene ramas que testear (creación de ventana, tabla de rutas, punto
      // de entrada) y se verifica ejecutando la aplicación de verdad.
      exclude: [
        'node_modules/**',
        'out/**',
        'drizzle/**',
        '**/*.config.ts',
        '**/*.d.ts',
        'src/renderer/src/main.ts',
        'src/renderer/src/router/**',
        'src/renderer/src/App.vue',
        'src/renderer/src/layouts/**',
        'src/main/index.ts',
        'src/main/app/**',
        'src/main/ipc/**',
        'src/preload/**'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
});
