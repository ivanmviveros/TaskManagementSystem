import react from "@vitejs/plugin-react";
// vitest/config, not vite: Vite 8's own defineConfig does not accept a `test` key.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // host: true so the Compose service is reachable from the host.
  server: { port: 5173, host: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
