module.exports = {
  apps: [
    {
      name: 'hr-backend',
      script: 'dist/src/main.js',
      cwd: '/home/dcorp/hr/backend',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      // Zero-downtime reload: wait for process.send('ready') before routing traffic
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
        FRONTEND_OAUTH_REDIRECT_URL: process.env.FRONTEND_OAUTH_REDIRECT_URL || '',
      },
    },
    {
      name: 'hr-frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000 --hostname 0.0.0.0',
      cwd: '/home/dcorp/hr/frontend',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      // Next.js handles SIGTERM natively; no wait_ready (next start doesn't send ready signal)
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
