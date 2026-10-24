import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { license: { fileName: 'licenses.md' } },
  test: { environment: 'node' },
});
