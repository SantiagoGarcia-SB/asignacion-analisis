import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/properties/**/*.test.{js,mjs}'],
    globals: false,
    testTimeout: 30000,
  },
});
