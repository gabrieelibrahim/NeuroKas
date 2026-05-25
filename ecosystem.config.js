module.exports = {
  apps: [
    {
      name: "neurocash-ai",
      script: "src/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production"
      },
      watch: false,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "300M"
    }
  ]
};
