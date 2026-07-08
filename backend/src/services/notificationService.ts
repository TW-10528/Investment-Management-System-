import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

export interface CreateNotificationInput {
  userEmail?: string
  userId?:    string
  type:       string
  title:      string
  message:    string
  link?:      string
  metadata?:  Record<string, unknown>
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userEmail: input.userEmail ?? null,
      userId:    input.userId    ?? null,
      type:      input.type,
      title:     input.title,
      message:   input.message,
      link:      input.link    ?? null,
      metadata:  (input.metadata ?? null) as any,
    },
  })
}

/** Create a notification for every admin user */
export async function notifyAllAdmins(input: Omit<CreateNotificationInput, 'userEmail' | 'userId'>) {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'active' },
    select: { id: true, email: true },
  })
  await Promise.all(
    admins.map((a: any) =>
      createNotification({ ...input, userId: a.id, userEmail: a.email })
    )
  )
}

/** Create notification for a specific user by email */
export async function notifyUser(email: string, input: Omit<CreateNotificationInput, 'userEmail' | 'userId'>) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
  if (!user) return
  return createNotification({ ...input, userId: user.id, userEmail: user.email })
}
