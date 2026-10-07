import react from "@vitejs/plugin-react";
// vitest/config, not vite: Vite 8's own defineConfig does not accept a `test` key.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // So the Compose service is reachable from the host.
    host: true,
    // A Docker bind mount on Windows (and often macOS) does not deliver file-change
    // events into the container, so the watcher never sees edits made on the host
    // and Vite keeps serving its cached modules — stale after every pull or branch
    // switch. Only the Compose service opts in to polling; a native `npm run dev`
    // keeps native file events, which are faster and cheaper (D59).
    watch: process.env.DEV_SERVER_POLLING === "true" ? { usePolling: true, interval: 300 } : undefined,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
