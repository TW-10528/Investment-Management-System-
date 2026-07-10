/**
 * IMS Backend — Hono + TypeScript + Prisma + PostgreSQL
 * Aviary Enterprise Platform pattern
 *
 * Start:  pnpm dev   (tsx watch)
 * Build:  pnpm build (tsc)
 */

import 'dotenv/config'
console.log("DATABASE_URL =", process.env.DATABASE_URL);
import './lib/httpProxy'   // side-effect: route outbound fetch via corporate proxy (must be first)
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config/index'
import { prisma } from './lib/prisma'
import fs from 'fs'
import path from 'path'

async function bootstrap() {
  // Ensure upload directory exists
  if (!fs.existsSync(config.uploadDir)) {
    fs.mkdirSync(config.uploadDir, { recursive: true })
  }

  // Test DB connection
  try {
    await prisma.$connect()
    console.log('✔  Database connected')
  } catch (err) {
    console.error('✖  Database connection failed:', err)
    process.exit(1)
  }

  const app = createApp()

  // Check for HTTPS certificates (relative to backend root)
  const certPath = path.resolve(__dirname, '../certs/star_twave_co_jp.crt')
  const keyPath = path.resolve(__dirname, '../certs/newkey.pem')
  const caPath = path.resolve(__dirname, '../certs/DigiCertCA.crt')

  const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(caPath)

  if (useHttps) {
    try {
      const serverOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: fs.readFileSync(caPath),
        maxHeaderSize: 100 * 1024 * 1024,
      }

      serve({
        fetch: app.fetch,
        port: config.port,
        serverOptions,
      }, (info) => {
        console.log(`\n🚀  IMS Backend (Hono + HTTPS) running`)
        console.log(`    https://investment-mgmt.twave.co.jp:${info.port}`)
        console.log(`    Health: https://investment-mgmt.twave.co.jp:${info.port}/health`)
        console.log(`    Environment: ${config.environment}`)
        console.log(`    SMTP: ${config.smtpUser ? 'configured' : 'dev-mode (console)'}`)
        console.log()
      })
    } catch (err) {
      console.error('✖  Failed to load HTTPS certificates:', err)
      console.log('  Falling back to HTTP...')
      serve({ fetch: app.fetch, port: config.port, serverOptions: { maxHeaderSize: 100 * 1024 * 1024 } }, (info) => {
        console.log(`\n🚀  IMS Backend (Hono) running`)
        console.log(`    http://localhost:${info.port}`)
        console.log(`    Health: http://localhost:${info.port}/health`)
        console.log(`    Environment: ${config.environment}`)
        console.log(`    SMTP: ${config.smtpUser ? 'configured' : 'dev-mode (console)'}`)
        console.log()
      })
    }
  } else {
    serve({ fetch: app.fetch, port: config.port, serverOptions: { maxHeaderSize: 100 * 1024 * 1024 } }, (info) => {
      console.log(`\n🚀  IMS Backend (Hono) running`)
      console.log(`    http://localhost:${info.port}`)
      console.log(`    Health: http://localhost:${info.port}/health`)
      console.log(`    Environment: ${config.environment}`)
      console.log(`    SMTP: ${config.smtpUser ? 'configured' : 'dev-mode (console)'}`)
      console.log()
    })
  }
}

bootstrap().catch(console.error)
