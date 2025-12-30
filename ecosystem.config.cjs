// PM2 Configuration for OmniBot Hub API
module.exports = {
  apps: [
    {
      name: 'omnibot-hub-api',
      script: './dist/server.js',
      cwd: '/var/www/omnibot-hub-api',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      // Logs
      log_file: '/var/log/omnibot/combined.log',
      out_file: '/var/log/omnibot/out.log',
      error_file: '/var/log/omnibot/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'uploads', 'logs'],
    },
  ],
};
