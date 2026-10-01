import { defineConfig } from 'vitest/config';

// Unit tests for business logic. Firestore rules tests have their own config (vitest.rules.config.ts)
// because they need the Firestore emulator.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
    environment: 'node'
  }
});
