module.exports = {
  apps: [{
    name: "cold-outreach",
    script: "bun",
    args: "run main.ts",
    interpreter: "none",
    cwd: "/home/shoyeb/migration_backup/Code/cold-outreach",
    env: {
      NODE_ENV: "production",
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    error_file: "/dev/null",
    out_file: "/dev/null",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  }],
};
