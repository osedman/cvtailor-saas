import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // This machine is memory-constrained and times out spawning worker
    // processes/threads; run everything in a single process instead.
    pool: 'forks',
    singleFork: true,
  },
})
