const path = require("path");

module.exports = {
  apps: [
    {
      name: "zuvigo-web",
      cwd: path.join(__dirname, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3050",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3050,
      },
    },
    {
      name: "zuvigo-worker",
      cwd: path.join(__dirname, "apps/worker"),
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
