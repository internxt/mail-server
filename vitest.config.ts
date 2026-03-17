import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  plugins: [swc.vite()],
});
