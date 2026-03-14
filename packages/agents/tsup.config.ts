import { defineConfig } from 'tsup';

export default defineConfig([
  // index.ts — exports for admin panel
  // DTS disabled: admin imports Queue from bullmq directly; GenerateSiteJob not imported in admin.
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: false,
    clean: true,
    splitting: false,
    noExternal: [/@monster\/.*/],
    external: ['astro', 'node-ssh', 'cloudflare', '@anthropic-ai/claude-agent-sdk'],
  },
  // worker.ts — standalone Node entrypoint, no DTS needed.
  // banner: createRequire fix is required because @monster/seo-scorer bundles cheerio →
  // iconv-lite (CJS) which calls require('buffer'). In ESM context, `require` is undefined,
  // so we inject a real require via createRequire(import.meta.url) so inline CJS wrappers work.
  {
    entry: { worker: 'src/worker.ts' },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    dts: false,
    splitting: false,
    noExternal: [/@monster\/.*/],
    external: ['astro', 'node-ssh', 'cloudflare', '@anthropic-ai/claude-agent-sdk'],
    banner: {
      js: `import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);`,
    },
  },
]);
