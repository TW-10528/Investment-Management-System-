export type AuthUser = {
    id: string;
    email: string;
    role: string;
    fullName: string | null;
};
export type HonoEnv = {
    Variables: {
        user: AuthUser;
    };
};
export type UserRole = 'user' | 'board_member' | 'finance_staff' | 'finance_manager' | 'admin';
export declare const EDIT_ROLES: UserRole[];
export declare const ADMIN_ROLES: UserRole[];
//# sourceMappingURL=index.d.ts.map