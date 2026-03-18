import type { NextConfig } from 'next'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read version from monorepo root package.json (single source of truth)
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
)

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: rootPkg.version,
  },
  serverExternalPackages: [
    '@anthropic-ai/claude-agent-sdk',
    '@monster/deployment',
    'node-ssh',
    'ssh2',
    'cpu-features',
    'sharp',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native SSH modules that cannot be bundled by webpack
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push('node-ssh', 'ssh2', 'cpu-features')
      }
    }
    return config
  },
}
export default nextConfig
