module.exports = {
  apps: [
    {
      name: 'ng-backend',
      cwd: '/opt/neurogrid/backend',
      script: '/opt/neurogrid/start-backend.sh',
      interpreter: 'bash',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
      },
      max_memory_restart: '512M',
      restart_delay: 3000,
      log_file: '/var/log/neurogrid/backend.log',
      error_file: '/var/log/neurogrid/backend-error.log',
      out_file: '/var/log/neurogrid/backend-out.log',
    },
    {
      name: 'ng-frontend',
      cwd: '/opt/neurogrid/frontend',
      script: '/opt/neurogrid/start-frontend.sh',
      interpreter: 'bash',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
        NEXT_PUBLIC_API_URL: 'https://api.neurogrid.network',
      },
      max_memory_restart: '512M',
      restart_delay: 3000,
      log_file: '/var/log/neurogrid/frontend.log',
      error_file: '/var/log/neurogrid/frontend-error.log',
      out_file: '/var/log/neurogrid/frontend-out.log',
    },
  ],
};
