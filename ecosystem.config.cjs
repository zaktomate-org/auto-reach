module.exports = {
  apps: [{
    name: "cold-outreach",
    script: "start.sh",
    interpreter: "bash",
    out_file: "./pm2-out.log",
    error_file: "./pm2-error.log",
    merge_logs: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  }],
};
