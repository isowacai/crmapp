import { defineConfig } from 'vitest/config';

// Firestore security rules tests; run via `npm run test:rules`, which starts the emulator first
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false
  }
});
