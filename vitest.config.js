import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://apply.example.edu/' } },
    include: ['test/**/*.test.js'],
    setupFiles: ['test/helpers/setup.js'],
  },
});
