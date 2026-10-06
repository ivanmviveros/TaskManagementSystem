/** @type {import('tailwindcss').Config} */
// Design tokens live here so there is a single source of truth for colour,
// spacing and typography rather than every feature inventing its own values
// (frontend §6). Pinned to Tailwind v3: v4 no longer reads this file.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        status: {
          pending: "#64748b",
          progress: "#2563eb",
          completed: "#16a34a",
          cancelled: "#94a3b8",
          overdue: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};
