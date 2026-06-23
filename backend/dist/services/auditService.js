"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
const prisma_1 = require("../lib/prisma");
async function logAction(action, tableName, userEmail, userId, recordId, oldValues, newValues) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: { action, tableName, userEmail, userId, recordId, oldValues: oldValues, newValues: newValues },
        });
    }
    catch {
        // Never crash on audit failure
    }
}
//# sourceMappingURL=auditService.js.map