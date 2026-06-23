"use strict";
// Notifications module — /api/v1/notifications
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const auth_1 = require("../../middleware/auth");
const prisma_1 = require("../../lib/prisma");
const router = new hono_1.Hono();
router.use('*', auth_1.auth);
function notifDict(n) {
    return {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        is_read: n.isRead,
        metadata: n.metadata,
        created_at: n.createdAt?.toISOString(),
    };
}
// GET /
router.get('/', async (c) => {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') ?? '50');
    const unreadOnly = c.req.query('unread') === 'true';
    const where = { userEmail: user.email };
    if (unreadOnly)
        where.isRead = false;
    const items = await prisma_1.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    const unreadCount = await prisma_1.prisma.notification.count({ where: { userEmail: user.email, isRead: false } });
    return c.json({ notifications: items.map(notifDict), unread_count: unreadCount });
});
// PATCH /read-all
router.patch('/read-all', async (c) => {
    const user = c.get('user');
    await prisma_1.prisma.notification.updateMany({ where: { userEmail: user.email, isRead: false }, data: { isRead: true } });
    return c.json({ message: 'All notifications marked as read' });
});
// PATCH /:id/read
router.patch('/:id/read', async (c) => {
    const user = c.get('user');
    const n = await prisma_1.prisma.notification.findUnique({ where: { id: c.req.param('id') } });
    if (!n || n.userEmail !== user.email)
        return c.json({ detail: 'Not found' }, 404);
    const updated = await prisma_1.prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    return c.json(notifDict(updated));
});
exports.default = router;
//# sourceMappingURL=notifications.routes.js.map