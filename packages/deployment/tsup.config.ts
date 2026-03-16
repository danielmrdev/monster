import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  target: 'node20',
  external: ['node-ssh', '@monster/db'],
  clean: true,
  sourcemap: false,
});
