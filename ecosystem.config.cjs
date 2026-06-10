module.exports = {
  apps: [
    {
      name: 'callcrm-api',
      cwd: './apps/api',
      script: 'src/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 4100
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4100
      }
    },
    {
      name: 'callcrm-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 4173',
      env: {
        NODE_ENV: 'production',
        API_PROXY_TARGET: 'http://localhost:4100'
      },
      env_production: {
        NODE_ENV: 'production',
        API_PROXY_TARGET: 'http://localhost:4100'
      }
    }
  ]
};
