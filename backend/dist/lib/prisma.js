"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Singleton — reuse connection in dev (Aviary pattern)
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.ENVIRONMENT === 'local' ? ['warn', 'error'] : ['error'],
    });
if (process.env.ENVIRONMENT === 'local') {
    globalForPrisma.prisma = exports.prisma;
}
//# sourceMappingURL=prisma.js.map