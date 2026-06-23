/**
 * Simple in-memory rate limiter (mirrors Python slowapi usage).
 * @param limit   max requests per window
 * @param windowS window size in seconds
 */
export declare function rateLimit(limit: number, windowS: number): import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    detail: string;
}, 429, "json">)>;
//# sourceMappingURL=rateLimit.d.ts.map