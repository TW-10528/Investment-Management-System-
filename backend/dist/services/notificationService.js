"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.notifyAllAdmins = notifyAllAdmins;
exports.notifyUser = notifyUser;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
async function createNotification(input) {
    return prisma_1.prisma.notification.create({
        data: {
            userEmail: input.userEmail ?? null,
            userId: input.userId ?? null,
            type: input.type,
            title: input.title,
            message: input.message,
            link: input.link ?? null,
            metadata: (input.metadata ?? client_1.Prisma.JsonNull),
        },
    });
}
/** Create a notification for every admin user */
async function notifyAllAdmins(input) {
    const admins = await prisma_1.prisma.user.findMany({
        where: { role: 'admin', status: 'active' },
        select: { id: true, email: true },
    });
    await Promise.all(admins.map(a => createNotification({ ...input, userId: a.id, userEmail: a.email })));
}
/** Create notification for a specific user by email */
async function notifyUser(email, input) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user)
        return;
    return createNotification({ ...input, userId: user.id, userEmail: user.email });
}
//# sourceMappingURL=notificationService.js.map