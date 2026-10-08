import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { routePaginationChange, type PageSize } from "../../lib/pagination";
import { useAppTable } from "./app-table";

const NO_ROWS: { id: string }[] = [];

interface HarnessProps {
  count: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

/** A table with no columns: only its pagination model, wired as the lists wire it. */
function Harness({ count, page, pageSize, onPageChange, onPageSizeChange }: HarnessProps) {
  const pagination = { pageIndex: page - 1, pageSize };
  const table = useAppTable({
    columns: [],
    data: NO_ROWS,
    rowCount: count,
    state: { pagination },
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, {
        goToPage: onPageChange,
        setPageSize: onPageSizeChange,
      }),
  });
  return (
    <table.AppTable>
      <table.Pagination />
    </table.AppTable>
  );
}

/** 187 rows at 20 a page is ten pages; page 5 shows rows 81–100. */
function renderPager(props: Partial<Pick<HarnessProps, "count" | "page" | "pageSize">> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <Harness
      count={187}
      page={5}
      pageSize={20}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

function pageNumbers(): string[] {
  const nav = screen.getByRole("navigation", { name: /pagination/i });
  return within(nav)
    .getAllByRole("button", { name: /^page \d+$/i })
    .map((button) => button.textContent ?? "");
}

describe("Pagination (through the table)", () => {
  it("shows the first, the last, and two pages either side of the current one", () => {
    renderPager();
    expect(pageNumbers()).toEqual(["1", "3", "4", "5", "6", "7", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("marks only the current page", () => {
    renderPager();
    const current = screen.getAllByRole("button", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("Page 5");
  });

  it("disables First and Prev on the first page", () => {
    renderPager({ page: 1 });
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeEnabled();
  });

  it("disables Next and Last on the last page", () => {
    renderPager({ page: 10 });
    expect(screen.getByRole("button", { name: "First page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
  });

  it("disables all four and shows one number when everything fits on a page", () => {
    renderPager({ count: 7, page: 1 });
    for (const name of ["First page", "Previous page", "Next page", "Last page"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(pageNumbers()).toEqual(["1"]);
  });

  it("asks for the page each control points at", async () => {
    const { onPageChange } = renderPager();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Page 7" }));
    await user.click(screen.getByRole("button", { name: "First page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onPageChange.mock.calls).toEqual([[7], [1], [4], [6], [10]]);
  });

  it("keeps the current page focusable but does nothing when it is clicked", async () => {
    // D55: the number just clicked BECOMES the current page. Disabling it, or
    // swapping it for a <span>, would drop keyboard focus to <body>.
    const { onPageChange } = renderPager();
    const current = screen.getByRole("button", { name: "Page 5" });
    expect(current).toBeEnabled();
    await userEvent.setup().click(current);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("offers exactly the page sizes the API allows, and a size change routes only the size", async () => {
    const { onPageChange, onPageSizeChange } = renderPager();
    const select = screen.getByLabelText(/rows per page/i);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "10",
      "20",
      "50",
      "100",
    ]);
    expect(select).toHaveValue("20");
    await userEvent.setup().selectOptions(select, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("states the range, and the page count that replaces the numbers below sm", () => {
    renderPager();
    expect(screen.getByText("81–100 of 187")).toBeInTheDocument();
    expect(screen.getByText("Page 5 of 10")).toBeInTheDocument();
  });

  it("counts from the last page when the URL's page is out of range", async () => {
    // ?page=99 of ten: the pager shows page 10, so Prev goes to 9, not 98.
    const { onPageChange } = renderPager({ page: 99 });
    expect(screen.getByRole("button", { name: "First page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(9);
  });
});

/** Like Harness, but the page and size live in state, so the table really re-renders. */
function StatefulHarness() {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const table = useAppTable({
    columns: [],
    data: NO_ROWS,
    rowCount: 187,
    state: { pagination },
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, {
        goToPage: (page) => setPagination((old) => ({ ...old, pageIndex: page - 1 })),
        setPageSize: (pageSize) => setPagination({ pageIndex: 0, pageSize }),
      }),
  });
  return (
    <table.AppTable>
      <table.Pagination />
    </table.AppTable>
  );
}

describe("Pagination following controlled state", () => {
  it("moves with the page and the size it is given across renders", async () => {
    render(<StatefulHarness />);
    const user = userEvent.setup();
    expect(screen.getByText("1–20 of 187")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("21–40 of 187")).toBeInTheDocument();
    expect(screen.getByRole("button", { current: "page" })).toHaveAccessibleName("Page 2");

    await user.selectOptions(screen.getByLabelText(/rows per page/i), "50");
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("1–50 of 187")).toBeInTheDocument();
  });
});
