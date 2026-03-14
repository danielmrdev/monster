import { defineConfig } from 'tsup';

export default defineConfig([
  // index.ts — exports for admin panel
  // DTS disabled: admin imports Queue from bullmq directly; GenerateSiteJob not imported in admin.
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: false,
    clean: true,
    splitting: false,
    noExternal: [/@monster\/.*/],
    external: ['astro'],
  },
  // worker.ts — standalone Node entrypoint, no DTS needed
  {
    entry: { worker: 'src/worker.ts' },
    format: ['esm'],
    dts: false,
    splitting: false,
    noExternal: [/@monster\/.*/],
    external: ['astro'],
  },
]);
