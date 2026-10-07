import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("is full size by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("px-4", "py-2");
  });

  it("has a compact size that does not also carry the full-size padding", () => {
    // Button merges classes with plain clsx, and Tailwind emits .px-4 after
    // .px-3 — so a className="px-3" override would silently lose. The size
    // must replace the padding, not add to it.
    render(<Button size="sm">1</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("px-3", "py-1.5");
    expect(button).not.toHaveClass("px-4");
    expect(button).not.toHaveClass("py-2");
  });
});
