import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        isolatedStorage: false,
        miniflare: {
          bindings: {
            SESSION_KEY: 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHM=',
            ACCOUNT_PEPPER: 'dGVzdC1wZXBwZXItMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHM=',
          },
        },
      },
    },
  },
});
