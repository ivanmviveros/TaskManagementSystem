export type Role = "ADMIN" | "SUPERVISOR" | "OPERATOR";

export const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "OPERATOR"];

/** How each role is shown. One map, beside ROLES (D56). */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};

export interface CurrentUser {
  id: string; // UUIDv7 string, never a number (D28)
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface LoginResponse {
  access: string;
  user: CurrentUser;
}
