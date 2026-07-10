import { createMiddleware } from 'hono/factory'

interface RateLimitRecord {
  count:   number
  resetAt: number
}

const store = new Map<string, RateLimitRecord>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k)
  }
}, 5 * 60 * 1000)

/**
 * Simple in-memory rate limiter (mirrors Python slowapi usage).
 * @param limit   max requests per window
 * @param windowS window size in seconds
 */
export function rateLimit(limit: number, windowS: number) {
  return createMiddleware(async (c, next) => {
    const key =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'unknown'
    const now = Date.now()
    const windowMs = windowS * 1000
    const rec = store.get(key)

    if (!rec || rec.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      await next()
      return
    }

    if (rec.count >= limit) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ detail: `Rate limit exceeded. Retry after ${retryAfter}s.` }, 429)
    }

    rec.count++
    await next()
  })
}
