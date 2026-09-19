module.exports = {
  apps: [
    {
      name: "zuvigo-web",
      script: "pnpm",
      args: "--filter @zuvigo/web start",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "zuvigo-worker",
      script: "pnpm",
      args: "--filter @zuvigo/worker start",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
