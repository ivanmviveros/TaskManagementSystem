import { describe, expect, it } from "vitest";

/**
 * Every source file, read as text. Vite's glob runs at build time, so this sees
 * exactly the files the app is built from.
 */
const SOURCES = import.meta.glob<string>("/src/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** A router <Link> whose first child is a <Button>: an <a> wrapping a <button>. */
const LINK_WRAPPING_BUTTON = /<Link\b[^>]*>\s*<Button\b/;

describe("links that look like buttons", () => {
  it("never nest a <Button> inside a <Link>", () => {
    // Nesting is invalid HTML (interactive content inside <a>) and costs keyboard
    // users two Tab stops for one control — found in the browser check on the
    // dashboard's "New task" (D48). Use <ButtonLink> instead.
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith(".test.tsx"))
      .filter(([, source]) => LINK_WRAPPING_BUTTON.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
