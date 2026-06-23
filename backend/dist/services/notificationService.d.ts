import { Prisma } from '@prisma/client';
export interface CreateNotificationInput {
    userEmail?: string;
    userId?: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
}
export declare function createNotification(input: CreateNotificationInput): Promise<{
    link: string | null;
    id: string;
    createdAt: Date;
    message: string;
    type: string;
    userId: string | null;
    userEmail: string | null;
    title: string;
    isRead: boolean;
    metadata: Prisma.JsonValue | null;
}>;
/** Create a notification for every admin user */
export declare function notifyAllAdmins(input: Omit<CreateNotificationInput, 'userEmail' | 'userId'>): Promise<void>;
/** Create notification for a specific user by email */
export declare function notifyUser(email: string, input: Omit<CreateNotificationInput, 'userEmail' | 'userId'>): Promise<{
    link: string | null;
    id: string;
    createdAt: Date;
    message: string;
    type: string;
    userId: string | null;
    userEmail: string | null;
    title: string;
    isRead: boolean;
    metadata: Prisma.JsonValue | null;
} | undefined>;
//# sourceMappingURL=notificationService.d.ts.map