export declare function hashPassword(plain: string): string;
export declare function verifyPassword(plain: string, hash: string): boolean;
export interface JWTPayload {
    sub: string;
    role: string;
    name: string;
}
export declare function createAccessToken(payload: JWTPayload): string;
export declare function verifyAccessToken(token: string): JWTPayload & {
    exp: number;
};
export declare function checkPasswordStrength(pw: string): string | null;
export declare function generateOtp(length?: number): string;
//# sourceMappingURL=security.d.ts.map