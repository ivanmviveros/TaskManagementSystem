import type { RequestHandler } from "msw";

/** Defaults each test overrides with server.use(). */
export const handlers: RequestHandler[] = [];
