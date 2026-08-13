module.exports = {
  apps: [
    {
      name: "nghung-bot",
      cwd: "/root/NgHung",
      script: "src-v2/index.js",
      interpreter: "/usr/local/bin/node",
      node_args: ["--env-file=.env", "--env-file=.env.scavio"],
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: "1500M",
      time: true,
      env: {
        NODE_ENV: "production",
        FORCE_CONSOLE: "0",
        V2_LEGACY_COMMANDS: "1",
      },
    },
  ],
};
