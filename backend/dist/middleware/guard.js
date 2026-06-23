"use strict";
// Aviary platform — role guard middleware factory
Object.defineProperty(exports, "__esModule", { value: true });
exports.guard = guard;
exports.canEdit = canEdit;
exports.isAdmin = isAdmin;
const factory_1 = require("hono/factory");
function guard(...roles) {
    return (0, factory_1.createMiddleware)(async (c, next) => {
        const user = c.get('user');
        if (!roles.includes(user.role)) {
            return c.json({ detail: 'Insufficient permissions' }, 403);
        }
        return next();
    });
}
function canEdit(_role) {
    // No role differentiation — every authenticated user can edit.
    return true;
}
function isAdmin(role) {
    return role === 'admin';
}
//# sourceMappingURL=guard.js.map