/**
 * IMS Backend — Hono + TypeScript + Prisma + PostgreSQL
 * Aviary Enterprise Platform pattern
 *
 * Start:  pnpm dev   (tsx watch)
 * Build:  pnpm build (tsc)
 */

import './lib/httpProxy'   // side-effect: route outbound fetch via corporate proxy (must be first)
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config/index'
import { prisma } from './lib/prisma'
import fs from 'fs'

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

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`\n🚀  IMS Backend (Hono) running`)
    console.log(`    http://localhost:${info.port}`)
    console.log(`    Health: http://localhost:${info.port}/health`)
    console.log(`    Environment: ${config.environment}`)
    console.log(`    SMTP: ${config.smtpUser ? 'configured' : 'dev-mode (console)'}`)
    console.log()
  })
}

bootstrap().catch(console.error)
