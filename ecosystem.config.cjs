// pm2 config for halloween-tbc (https://halloween.tbcap.mn, port 3131 from .env).
// Deploy with ./deploy.sh. Bun does not support pm2 cluster mode — fork only.
module.exports = {
  apps: [
    {
      name: "halloween-tbc",
      script: "/root/.bun/bin/bun", // adjust to `which bun` on the server
      args: "--env-file=.env server.ts",
      interpreter: "none",
      cwd: "/root/projects/prod/halloween-tbc",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
