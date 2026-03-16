import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@anthropic-ai/claude-agent-sdk',
    '@monster/deployment',
    'node-ssh',
    'ssh2',
    'cpu-features',
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
