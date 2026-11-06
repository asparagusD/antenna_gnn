import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/** Benchmarks only (npm run bench:infer); never part of `make check`. */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['bench/**/*.bench.test.ts'],
      testTimeout: 600_000,
    },
  }),
);
