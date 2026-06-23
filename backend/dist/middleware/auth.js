"use strict";
// Aviary platform — JWT auth middleware
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const factory_1 = require("hono/factory");
const security_1 = require("../lib/security");
const prisma_1 = require("../lib/prisma");
exports.auth = (0, factory_1.createMiddleware)(async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
        return c.json({ detail: 'Not authenticated' }, 401);
    }
    const token = header.slice(7);
    try {
        const payload = (0, security_1.verifyAccessToken)(token);
        const user = await prisma_1.prisma.user.findUnique({ where: { email: payload.sub } });
        if (!user || !user.isActive || user.status !== 'active') {
            return c.json({ detail: 'User inactive or not found' }, 401);
        }
        c.set('user', { id: user.id, email: user.email, role: user.role, fullName: user.fullName });
        await next();
    }
    catch {
        return c.json({ detail: 'Invalid or expired token' }, 401);
    }
});
//# sourceMappingURL=auth.js.map