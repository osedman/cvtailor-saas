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
    // Some local machines are memory-constrained and time out spawning
    // worker processes/threads; run everything in a single process instead.
    fileParallelism: false,
  },
})
