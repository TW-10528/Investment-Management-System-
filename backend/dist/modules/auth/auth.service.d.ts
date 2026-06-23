export declare function checkLockout(email: string): {
    locked: boolean;
    msg?: string;
};
export declare function recordFailed(email: string): void;
export declare function clearAttempts(email: string): void;
export declare function signup(input: {
    full_name: string;
    email: string;
    password: string;
    role?: string;
}): Promise<{
    id: string;
    email: string;
    fullName: string | null;
    fullNameJp: string | null;
    hashedPassword: string;
    role: import(".prisma/client").$Enums.UserRole;
    status: import(".prisma/client").$Enums.UserStatus;
    isActive: boolean;
    lastLogin: Date | null;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function login(username: string, password: string): Promise<{
    token: string;
    user: {
        id: string;
        email: string;
        fullName: string | null;
        fullNameJp: string | null;
        hashedPassword: string;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.UserStatus;
        isActive: boolean;
        lastLogin: Date | null;
        createdAt: Date;
        updatedAt: Date;
    };
}>;
export declare function forgotPassword(email: string): Promise<{
    message: string;
    devOtp: string | undefined;
}>;
export declare function verifyOtp(email: string, otp: string): Promise<boolean>;
export declare function resetPassword(email: string, otp: string, newPassword: string): Promise<void>;
//# sourceMappingURL=auth.service.d.ts.map