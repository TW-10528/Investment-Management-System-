"use strict";
// Aviary Enterprise Platform — Hono application factory
// app.ts registers middleware + modules; main.ts starts the server.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const hono_1 = require("hono");
const cors_1 = require("hono/cors");
const logger_1 = require("hono/logger");
const errors_1 = require("./lib/errors");
const index_1 = require("./config/index");
// ── Modules ───────────────────────────────────────────────────────────────────
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const funds_routes_1 = __importDefault(require("./modules/funds/funds.routes"));
const capital_calls_routes_1 = __importDefault(require("./modules/capital-calls/capital-calls.routes"));
const distributions_routes_1 = __importDefault(require("./modules/distributions/distributions.routes"));
const fx_rates_routes_1 = __importDefault(require("./modules/fx-rates/fx-rates.routes"));
const dashboard_routes_1 = __importDefault(require("./modules/dashboard/dashboard.routes"));
const notices_routes_1 = __importDefault(require("./modules/notices/notices.routes"));
const notifications_routes_1 = __importDefault(require("./modules/notifications/notifications.routes"));
const rules_routes_1 = __importDefault(require("./modules/rules/rules.routes"));
const fund_reports_routes_1 = __importDefault(require("./modules/fund-reports/fund-reports.routes"));
const ai_extract_routes_1 = __importDefault(require("./modules/ai-extract/ai-extract.routes"));
const fund_onboarding_routes_1 = __importDefault(require("./modules/fund-onboarding/fund-onboarding.routes"));
const fund_family_routes_1 = __importDefault(require("./modules/fund-family/fund-family.routes"));
function createApp() {
    const app = new hono_1.Hono();
    // ── Global middleware ──────────────────────────────────────────────────────
    // Normalise trailing slashes (before logger so re-fetched requests don't double-log)
    app.use('*', async (c, next) => {
        if (c.req.header('x-normalized'))
            return next();
        const path = new URL(c.req.url).pathname;
        if (path.length > 1 && path.endsWith('/')) {
            const url = new URL(c.req.url);
            url.pathname = path.slice(0, -1);
            const headers = new Headers(c.req.raw.headers);
            headers.set('x-normalized', '1');
            const rewritten = new Request(url.toString(), {
                method: c.req.method,
                headers,
                body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
            });
            return app.fetch(rewritten);
        }
        return next();
    });
    app.use('*', (0, logger_1.logger)());
    app.use('*', (0, cors_1.cors)({
        origin: index_1.config.allowedOrigins,
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));
    // ── Health check ───────────────────────────────────────────────────────────
    app.get('/health', (c) => c.json({
        status: 'healthy',
        environment: index_1.config.environment,
        smtp_configured: !!(index_1.config.smtpUser && index_1.config.smtpPassword),
        runtime: 'hono',
        version: '3.0.0',
        platform: 'aviary',
    }));
    // ── API v1 modules ─────────────────────────────────────────────────────────
    app.route('/api/v1/auth', auth_routes_1.default);
    app.route('/api/v1/users', users_routes_1.default);
    app.route('/api/v1/funds', funds_routes_1.default);
    app.route('/api/v1/capital-calls', capital_calls_routes_1.default);
    app.route('/api/v1/distributions', distributions_routes_1.default);
    app.route('/api/v1/fx-rates', fx_rates_routes_1.default);
    app.route('/api/v1/dashboard', dashboard_routes_1.default);
    app.route('/api/v1/notices', notices_routes_1.default);
    app.route('/api/v1/notifications', notifications_routes_1.default);
    app.route('/api/v1/rules', rules_routes_1.default);
    app.route('/api/v1/fund-reports', fund_reports_routes_1.default);
    app.route('/api/v1/ai-extract', ai_extract_routes_1.default);
    app.route('/api/v1/fund-onboarding', fund_onboarding_routes_1.default);
    app.route('/api/v1/fund-families', fund_family_routes_1.default);
    // ── 404 ────────────────────────────────────────────────────────────────────
    app.notFound((c) => c.json({ detail: `Route ${c.req.method} ${c.req.path} not found` }, 404));
    // ── Global error handler (catches HTTPError + unhandled throws) ────────────
    app.onError((err, c) => {
        if (err instanceof errors_1.HTTPError) {
            return c.json({ detail: err.message }, err.status);
        }
        console.error('[ERROR]', err);
        return c.json({ detail: err.message || 'Internal server error' }, 500);
    });
    return app;
}
//# sourceMappingURL=app.js.map