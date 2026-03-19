// PM2 entry point for monster-admin
// Placed here so PM2 finds apps/admin/package.json for version display
process.argv.splice(2, 0, 'start')
require('./node_modules/next/dist/bin/next')
