/**
 * Hono application factory.
 * Follows Aviary platform pattern: app.ts sets up middleware + routes,
 * main.ts starts the server.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { config } from './config/index'

// Routes
import authRoutes         from './routes/auth'
import usersRoutes        from './routes/users'
import fundsRoutes        from './routes/funds'
import capitalCallsRoutes from './routes/capitalCalls'
import distributionsRoutes from './routes/distributions'
import fxRatesRoutes      from './routes/fxRates'
import dashboardRoutes    from './routes/dashboard'
import noticesRoutes      from './routes/notices'

export function createApp() {
  const app = new Hono()

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use('*', logger())

  app.use('*', cors({
    origin:      config.allowedOrigins,
    credentials: true,
    allowMethods:['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders:['Content-Type', 'Authorization', 'X-Requested-With'],
  }))

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({
    status:           'healthy',
    environment:      config.environment,
    smtp_configured:  !!(config.smtpUser && config.smtpPassword),
    runtime:          'hono',
    version:          '2.0.0',
  }))

  // ── API v1 routes ─────────────────────────────────────────────────────────
  app.route('/api/v1/auth',           authRoutes)
  app.route('/api/v1/users',          usersRoutes)
  app.route('/api/v1/funds',          fundsRoutes)
  app.route('/api/v1/capital-calls',  capitalCallsRoutes)
  app.route('/api/v1/distributions',  distributionsRoutes)
  app.route('/api/v1/fx-rates',       fxRatesRoutes)
  app.route('/api/v1/dashboard',      dashboardRoutes)
  app.route('/api/v1/notices',        noticesRoutes)

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ detail: `Route ${c.req.method} ${c.req.path} not found` }, 404))

  // ── Error handler ─────────────────────────────────────────────────────────
  app.onError((err, c) => {
    console.error('[ERROR]', err)
    return c.json({ detail: err.message || 'Internal server error' }, 500)
  })

  return app
}
