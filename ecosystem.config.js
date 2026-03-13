module.exports = {
  apps: [
    {
      name: 'monster-admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/home/daniel/monster/apps/admin',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: '3004',
        NODE_ENV: 'production',
      },
      error_file: '/home/daniel/monster/logs/pm2-error.log',
      out_file: '/home/daniel/monster/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
