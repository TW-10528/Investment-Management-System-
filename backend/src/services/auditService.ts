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
      data: { action, tableName, userEmail, userId, recordId, oldValues: oldValues as any, newValues: newValues as any },
    })
  } catch {
    // Never crash on audit failure
  }
}
