"use strict";
// Users business logic
Object.defineProperty(exports, "__esModule", { value: true });
exports.userDict = userDict;
exports.listUsers = listUsers;
exports.getPendingCount = getPendingCount;
exports.createUser = createUser;
exports.approveUser = approveUser;
exports.rejectUser = rejectUser;
exports.updateUser = updateUser;
exports.deactivateUser = deactivateUser;
const prisma_1 = require("../../lib/prisma");
const security_1 = require("../../lib/security");
const notificationService_1 = require("../../services/notificationService");
const index_1 = require("../../config/index");
function userDict(u) {
    return {
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        full_name_jp: u.fullNameJp,
        role: u.role,
        status: u.status,
        is_active: u.isActive,
        last_login: u.lastLogin?.toISOString() ?? null,
        created_at: u.createdAt?.toISOString() ?? null,
    };
}
async function listUsers() {
    const users = await prisma_1.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(userDict);
}
async function getPendingCount() {
    return prisma_1.prisma.user.count({ where: { status: 'pending' } });
}
async function createUser(input) {
    if (!input.email || !input.full_name || !input.password) {
        throw Object.assign(new Error('email, full_name, and password are required.'), { status: 400 });
    }
    const exists = await prisma_1.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists)
        throw Object.assign(new Error('Email already registered.'), { status: 400 });
    const active = await prisma_1.prisma.user.count({ where: { status: 'active' } });
    if (active >= index_1.config.maxActiveUsers) {
        throw Object.assign(new Error(`System limit of ${index_1.config.maxActiveUsers} active users reached.`), { status: 400 });
    }
    const pwErr = (0, security_1.checkPasswordStrength)(input.password);
    if (pwErr)
        throw Object.assign(new Error(pwErr), { status: 400 });
    const user = await prisma_1.prisma.user.create({
        data: {
            email: input.email.toLowerCase(),
            fullName: input.full_name,
            fullNameJp: input.full_name_jp ?? null,
            hashedPassword: (0, security_1.hashPassword)(input.password),
            role: (input.role ?? 'finance_staff'),
            status: 'active',
            isActive: true,
        },
    });
    return userDict(user);
}
async function approveUser(id, role) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw Object.assign(new Error('User not found.'), { status: 404 });
    if (user.status !== 'pending') {
        throw Object.assign(new Error(`User is not pending (status: ${user.status}).`), { status: 400 });
    }
    const active = await prisma_1.prisma.user.count({ where: { status: 'active' } });
    if (active >= index_1.config.maxActiveUsers) {
        throw Object.assign(new Error(`Cannot approve: system already has ${index_1.config.maxActiveUsers} active users.`), { status: 400 });
    }
    const updated = await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', isActive: true, ...(role ? { role: role } : {}) },
    });
    await (0, notificationService_1.notifyUser)(user.email, {
        type: 'user_approved',
        title: 'Account Approved ✓',
        message: `Your account has been approved with role: ${role ?? user.role}. You can now sign in.`,
        link: '/',
    });
    return userDict(updated);
}
async function rejectUser(id) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw Object.assign(new Error('User not found.'), { status: 404 });
    if (user.status !== 'pending')
        throw Object.assign(new Error('User is not pending.'), { status: 400 });
    const updated = await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { status: 'inactive', isActive: false },
    });
    await (0, notificationService_1.notifyUser)(user.email, {
        type: 'user_rejected',
        title: 'Account Request Declined',
        message: 'Your account request was not approved. Contact your administrator for details.',
        link: '/login',
    });
    return userDict(updated);
}
async function updateUser(id, body) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw Object.assign(new Error('User not found.'), { status: 404 });
    const data = {};
    if (body.full_name !== undefined)
        data.fullName = body.full_name;
    if (body.full_name_jp !== undefined)
        data.fullNameJp = body.full_name_jp;
    if (body.role !== undefined)
        data.role = body.role;
    if (body.is_active !== undefined) {
        data.isActive = body.is_active;
        data.status = body.is_active ? 'active' : 'inactive';
    }
    if (body.password) {
        const pwErr = (0, security_1.checkPasswordStrength)(body.password);
        if (pwErr)
            throw Object.assign(new Error(pwErr), { status: 400 });
        data.hashedPassword = (0, security_1.hashPassword)(body.password);
    }
    const updated = await prisma_1.prisma.user.update({ where: { id: user.id }, data });
    return userDict(updated);
}
async function deactivateUser(id, requesterId) {
    if (id === requesterId) {
        throw Object.assign(new Error('You cannot deactivate your own account.'), { status: 400 });
    }
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw Object.assign(new Error('User not found.'), { status: 404 });
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { isActive: false, status: 'inactive' } });
    return { message: `${user.email} deactivated.` };
}
//# sourceMappingURL=users.service.js.map