import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { license: { fileName: 'licenses.md' } },
  test: { environment: 'node', fsModuleCache: false }, // its cached test files keep stale import.meta.glob results when files under public/ change
});
