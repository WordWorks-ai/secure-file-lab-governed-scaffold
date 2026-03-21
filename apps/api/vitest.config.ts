import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      THROTTLE_LIMIT: '10000',
      THROTTLE_AUTH_LIMIT: '10000',
      THROTTLE_SHARE_LIMIT: '10000',
    },
    coverage: {
      enabled: false,
    },
  },
});
