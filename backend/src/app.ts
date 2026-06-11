// Aviary Enterprise Platform — Hono application factory
// app.ts registers middleware + modules; main.ts starts the server.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { HTTPError } from './lib/errors'
import { config } from './config/index'

// ── Modules ───────────────────────────────────────────────────────────────────
import authRoutes         from './modules/auth/auth.routes'
import usersRoutes        from './modules/users/users.routes'
import fundsRoutes        from './modules/funds/funds.routes'
import capitalCallsRoutes from './modules/capital-calls/capital-calls.routes'
import distributionsRoutes from './modules/distributions/distributions.routes'
import fxRatesRoutes      from './modules/fx-rates/fx-rates.routes'
import dashboardRoutes    from './modules/dashboard/dashboard.routes'
import noticesRoutes      from './modules/notices/notices.routes'
import notificationsRoutes from './modules/notifications/notifications.routes'
import rulesRoutes        from './modules/rules/rules.routes'
import fundReportsRoutes  from './modules/fund-reports/fund-reports.routes'

export function createApp() {
  const app = new Hono()

  // ── Global middleware ──────────────────────────────────────────────────────
  // Normalise trailing slashes (before logger so re-fetched requests don't double-log)
  app.use('*', async (c, next) => {
    if (c.req.header('x-normalized')) return next()
    const path = new URL(c.req.url).pathname
    if (path.length > 1 && path.endsWith('/')) {
      const url = new URL(c.req.url)
      url.pathname = path.slice(0, -1)
      const headers = new Headers(c.req.raw.headers)
      headers.set('x-normalized', '1')
      const rewritten = new Request(url.toString(), {
        method:  c.req.method,
        headers,
        body:    ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
      })
      return app.fetch(rewritten)
    }
    return next()
  })

  app.use('*', logger())

  app.use('*', cors({
    origin:       config.allowedOrigins,
    credentials:  true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }))

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({
    status:          'healthy',
    environment:     config.environment,
    smtp_configured: !!(config.smtpUser && config.smtpPassword),
    runtime:         'hono',
    version:         '3.0.0',
    platform:        'aviary',
  }))

  // ── API v1 modules ─────────────────────────────────────────────────────────
  app.route('/api/v1/auth',           authRoutes)
  app.route('/api/v1/users',          usersRoutes)
  app.route('/api/v1/funds',          fundsRoutes)
  app.route('/api/v1/capital-calls',  capitalCallsRoutes)
  app.route('/api/v1/distributions',  distributionsRoutes)
  app.route('/api/v1/fx-rates',       fxRatesRoutes)
  app.route('/api/v1/dashboard',      dashboardRoutes)
  app.route('/api/v1/notices',        noticesRoutes)
  app.route('/api/v1/notifications',  notificationsRoutes)
  app.route('/api/v1/rules',          rulesRoutes)
  app.route('/api/v1/fund-reports',   fundReportsRoutes)

  // ── 404 ────────────────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ detail: `Route ${c.req.method} ${c.req.path} not found` }, 404))

  // ── Global error handler (catches HTTPError + unhandled throws) ────────────
  app.onError((err, c) => {
    if (err instanceof HTTPError) {
      return c.json({ detail: err.message }, err.status as any)
    }
    console.error('[ERROR]', err)
    return c.json({ detail: err.message || 'Internal server error' }, 500)
  })

  return app
}
