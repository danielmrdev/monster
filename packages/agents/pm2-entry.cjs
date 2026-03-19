// PM2 entry point for monster-worker
// Placed here so PM2 finds packages/agents/package.json for version display
const { pathToFileURL } = require('url')
const path = require('path')

import(pathToFileURL(path.join(__dirname, 'dist', 'worker.js')).href).catch((err) => {
  console.error('Worker startup error:', err)
  process.exit(1)
})
