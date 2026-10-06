import { apiClient } from "../../../lib/api-client";
import type { CurrentUser, LoginResponse } from "../types";

export const login = (email: string, password: string) =>
  apiClient.post<LoginResponse>("/auth/login/", { email, password });

export const logout = () => apiClient.post<void>("/auth/logout/", {});

export const fetchCurrentUser = () => apiClient.get<CurrentUser>("/users/me/");
