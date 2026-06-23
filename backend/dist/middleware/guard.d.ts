import type { HonoEnv } from '../types/index';
export declare function guard(...roles: string[]): import("hono").MiddlewareHandler<HonoEnv, string, {}, Response>;
export declare function canEdit(_role: string): boolean;
export declare function isAdmin(role: string): boolean;
//# sourceMappingURL=guard.d.ts.map