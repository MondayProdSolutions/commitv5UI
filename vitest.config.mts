import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Sin esto, `vitest run --project unit` falla en cualquier shell limpio: los
// archivos *.test.ts (a diferencia de *.itest.ts) no pasan por
// test/vitest.global-setup.ts, pero igual importan src/lib/db.ts, que lanza en
// el top-level si DATABASE_URL no está definida (ver src/lib/db.ts). Mismo
// patrón que ya usa prisma.config.ts.

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.itest.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.itest.ts'],
          globalSetup: ['./test/vitest.global-setup.ts'],
          setupFiles: ['./test/vitest.setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
