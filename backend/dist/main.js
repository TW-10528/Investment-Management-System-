"use strict";
/**
 * IMS Backend — Hono + TypeScript + Prisma + PostgreSQL
 * Aviary Enterprise Platform pattern
 *
 * Start:  pnpm dev   (tsx watch)
 * Build:  pnpm build (tsc)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("./lib/httpProxy"); // side-effect: route outbound fetch via corporate proxy (must be first)
const node_server_1 = require("@hono/node-server");
const app_1 = require("./app");
const index_1 = require("./config/index");
const prisma_1 = require("./lib/prisma");
const fs_1 = __importDefault(require("fs"));
async function bootstrap() {
    // Ensure upload directory exists
    if (!fs_1.default.existsSync(index_1.config.uploadDir)) {
        fs_1.default.mkdirSync(index_1.config.uploadDir, { recursive: true });
    }
    // Test DB connection
    try {
        await prisma_1.prisma.$connect();
        console.log('✔  Database connected');
    }
    catch (err) {
        console.error('✖  Database connection failed:', err);
        process.exit(1);
    }
    const app = (0, app_1.createApp)();
    (0, node_server_1.serve)({ fetch: app.fetch, port: index_1.config.port }, (info) => {
        console.log(`\n🚀  IMS Backend (Hono) running`);
        console.log(`    http://localhost:${info.port}`);
        console.log(`    Health: http://localhost:${info.port}/health`);
        console.log(`    Environment: ${index_1.config.environment}`);
        console.log(`    SMTP: ${index_1.config.smtpUser ? 'configured' : 'dev-mode (console)'}`);
        console.log();
    });
}
bootstrap().catch(console.error);
//# sourceMappingURL=main.js.map