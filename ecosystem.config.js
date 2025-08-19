module.exports = {
  apps: [{
    name: 'agentic-support',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Monitoring
    min_uptime: '10s',
    max_restarts: 10,
    
    // Auto-restart on file changes (development)
    ignore_watch: ['node_modules', 'logs', 'data', '.git'],
    watch_options: {
      followSymlinks: false
    }
  }]
};