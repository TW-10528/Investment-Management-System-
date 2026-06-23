export declare function userDict(u: any): {
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
};
export declare function listUsers(): Promise<{
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
}[]>;
export declare function getPendingCount(): Promise<number>;
export declare function createUser(input: {
    email: string;
    full_name: string;
    full_name_jp?: string;
    password: string;
    role?: string;
}): Promise<{
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
}>;
export declare function approveUser(id: string, role?: string): Promise<{
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
}>;
export declare function rejectUser(id: string): Promise<{
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
}>;
export declare function updateUser(id: string, body: any): Promise<{
    id: any;
    email: any;
    full_name: any;
    full_name_jp: any;
    role: any;
    status: any;
    is_active: any;
    last_login: any;
    created_at: any;
}>;
export declare function deactivateUser(id: string, requesterId: string): Promise<{
    message: string;
}>;
//# sourceMappingURL=users.service.d.ts.map