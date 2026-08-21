import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'netlify/functions/**/*.test.ts',
      'tests/functions/**/*.test.ts',
    ],
  },
})
