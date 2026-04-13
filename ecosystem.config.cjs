module.exports = {
  apps: [{
    name: "cold-outreach",
    script: "start.sh",
    interpreter: "bash",
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
  }],
};
