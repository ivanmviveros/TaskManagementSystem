export type Role = "ADMIN" | "SUPERVISOR" | "OPERATOR";

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
