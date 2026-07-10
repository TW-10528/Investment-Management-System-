module.exports = {
  apps: [
    {
      name: "ims-backend",
      cwd: "./backend",
      script: "node_modules/.bin/tsx",
      args: "watch src/main.ts",
      env: {
        PORT: 8004,
        NODE_ENV: "development"
      },
      watch: false
    },
    {
      name: "ims-frontend",
      cwd: "./frontend",
      script: "node_modules/.bin/vite",
      env: {
        VITE_PORT: 5175,
        NODE_ENV: "development"
      },
      watch: false
    }
  ]
}
