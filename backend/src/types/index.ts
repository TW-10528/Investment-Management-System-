// Aviary platform — central type definitions

export type AuthUser = {
  id:       string
  email:    string
  role:     string
  fullName: string | null
}

export type HonoEnv = {
  Variables: {
    user: AuthUser
  }
}

export type UserRole =
  | 'user'
  | 'board_member'
  | 'finance_staff'
  | 'finance_manager'
  | 'admin'

export const EDIT_ROLES:  UserRole[] = ['admin', 'finance_manager', 'finance_staff']
export const ADMIN_ROLES: UserRole[] = ['admin']
