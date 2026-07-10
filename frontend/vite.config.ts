import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    host: "0.0.0.0",
    port: 5178,
    strictPort: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "investment-mgmt.twave.co.jp",
      "172.16.5.105"
    ],
    proxy: {
      "/api": { target: "http://localhost:8006", changeOrigin: true }
    }
  }
})