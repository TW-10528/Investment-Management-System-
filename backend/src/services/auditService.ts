import { prisma } from '../lib/prisma'

export async function logAction(
  action:    string,
  tableName: string,
  userEmail: string,
  userId:    string,
  recordId?: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { action, tableName, userEmail, userId, recordId, oldValues, newValues },
    })
  } catch {
    // Never crash on audit failure
  }
}
