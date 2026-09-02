// =========================================================
// PM2 ECOSYSTEM CONFIG - Backend cluster mode
// =========================================================

module.exports = {
  apps: [{
    name: 'moviehub-backend',
    script: 'server.js',
    instances: 'max', // Barcha CPU yadrolaridan foydalanish
    exec_mode: 'cluster', // Cluster mode
    max_memory_restart: '512M', // Xotira chegarasi
    watch: false, // Productionda watch o'chirilgan
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    
    // Restart settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Autorestart
    autorestart: true,
    kill_timeout: 5000,
    
    // Monitoring
    metrics: true,
    instance_var: 'INSTANCE_ID'
  }]
};
