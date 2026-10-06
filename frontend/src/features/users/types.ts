import type { Role } from "../auth/types";

/** UserMinimalSerializer — what a Supervisor may see (spec §7.2 rule 2). */
export interface UserMinimal {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
}

/** UserSerializer — the Admin read. */
export interface UserDetail extends UserMinimal {
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  last_login: string | null;
}

export interface UserFilters {
  role?: Role;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface UserCreateInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface UserUpdateInput {
  first_name?: string;
  last_name?: string;
  role?: Role;
  is_active?: boolean;
  /** Omitted entirely when unchanged — "" would fail password validation. */
  password?: string;
}
