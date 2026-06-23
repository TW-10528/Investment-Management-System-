"use strict";
// Users module — /api/v1/users
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const auth_1 = require("../../middleware/auth");
const guard_1 = require("../../middleware/guard");
const UsersService = __importStar(require("./users.service"));
const router = new hono_1.Hono();
router.use('*', auth_1.auth);
// GET /
router.get('/', (0, guard_1.guard)('admin'), async (c) => {
    return c.json(await UsersService.listUsers());
});
// GET /pending-count
router.get('/pending-count', (0, guard_1.guard)('admin'), async (c) => {
    const count = await UsersService.getPendingCount();
    return c.json({ count });
});
// POST /
router.post('/', (0, guard_1.guard)('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
        return c.json(await UsersService.createUser(body));
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// POST /:id/approve
router.post('/:id/approve', (0, guard_1.guard)('admin'), async (c) => {
    const role = c.req.query('role');
    try {
        const updated = await UsersService.approveUser(c.req.param('id'), role);
        return c.json({ message: `${updated.full_name} approved.`, ...updated });
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// POST /:id/reject
router.post('/:id/reject', (0, guard_1.guard)('admin'), async (c) => {
    try {
        const updated = await UsersService.rejectUser(c.req.param('id'));
        return c.json({ message: `${updated.full_name}'s registration has been rejected.` });
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// PUT /:id
router.put('/:id', (0, guard_1.guard)('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
        return c.json(await UsersService.updateUser(c.req.param('id'), body));
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
// DELETE /:id
router.delete('/:id', (0, guard_1.guard)('admin'), async (c) => {
    const me = c.get('user');
    try {
        return c.json(await UsersService.deactivateUser(c.req.param('id'), me.id));
    }
    catch (err) {
        return c.json({ detail: err.message }, err.status ?? 400);
    }
});
exports.default = router;
//# sourceMappingURL=users.routes.js.map