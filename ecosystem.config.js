module.exports = {
  apps: [
    {
      name: 'hr-backend',
      script: 'dist/src/main.js',
      cwd: '/home/phamhai/hr/hr_project/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
      },
    },
    {
      name: 'hr-frontend',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000 --hostname 0.0.0.0',
      cwd: '/home/phamhai/hr/hr_project/frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
