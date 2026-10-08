import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import type { KeyboardEvent, UIEvent } from "react";

import { buttonClasses } from "../../../components/buttonClasses";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { useAssignableUsers } from "../../users/hooks/useAssignableUsers";
import type { UserMinimal } from "../../users/types";
import { comboboxActions, initialComboboxState } from "./assignee-combobox-store";

const SEARCH_DELAY_MS = 300;
/** How close to the bottom of the list, in px, scrolling starts the next page. */
const LOAD_MORE_THRESHOLD_PX = 48;

function userLabel(user: UserMinimal): string {
  return `${user.first_name} ${user.last_name} (${user.email})`;
}

interface AssigneeComboboxProps {
  id: string;
  label: string;
  /** The chosen assignee — a whole user, so a choice past page 1 still shows its name. */
  value: UserMinimal | null;
  onChange: (user: UserMinimal | null) => void;
  error?: string;
}

/**
 * The assignee picker: a searchable, paged combobox (D64), following the
 * WAI-ARIA "combobox with listbox popup" pattern — focus stays on the input
 * and the active option is announced through aria-activedescendant.
 *
 * Typing searches the server after a pause; more users load when the keyboard
 * reaches the last loaded one, when the list is scrolled to its end, or from
 * "Load more". Nothing is fetched until the list first opens.
 */
export function AssigneeCombobox({ id, label, value, onChange, error }: AssigneeComboboxProps) {
  const store = useCreateStore(initialComboboxState, comboboxActions);
  const { open, query, activeIndex } = useSelector(store);
  const debounced = useDebouncedValue(query?.trim() ?? "", SEARCH_DELAY_MS);
  const search = query === null ? "" : debounced;

  const assignable = useAssignableUsers(search, open);
  const users = assignable.data?.pages.flatMap((page) => page.results) ?? [];
  const total = assignable.data?.pages[0]?.count ?? 0;
  // "Unassigned" belongs to the unfiltered list only: a search is a hunt for a person.
  const options: (UserMinimal | null)[] = search === "" ? [null, ...users] : users;
  const active = activeIndex < options.length ? activeIndex : -1;

  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;
  const optionId = (option: UserMinimal | null) =>
    `${id}-option-${option === null ? "none" : option.id}`;
  const activeOption = open && active >= 0 ? options[active] : undefined;
  const activeOptionId = activeOption === undefined ? undefined : optionId(activeOption);

  // Only when the active option changes: on every render, a page loaded by
  // scrolling would pull the list back up to it.
  useEffect(() => {
    if (activeOptionId === undefined) return;
    // Optional call: jsdom implements no scrolling.
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const canLoadMore = assignable.hasNextPage && !assignable.isFetchingNextPage;
  function loadMore() {
    if (canLoadMore) void assignable.fetchNextPage();
  }

  function openList() {
    if (open) return;
    const current = options.findIndex((option) => option?.id === value?.id);
    store.actions.openAt(current === -1 ? 0 : current);
  }

  /** Closes without choosing: the input goes back to the chosen user. */
  function close() {
    store.actions.close();
  }

  function choose(option: UserMinimal | null) {
    onChange(option);
    close();
  }

  function moveTo(index: number) {
    store.actions.moveTo(index);
    if (index === options.length - 1) loadMore();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else if (options.length > 0) moveTo(Math.min(active + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else if (options.length > 0) moveTo(Math.max(active - 1, 0));
        break;
      case "Enter":
        // Open: Enter chooses, and must not submit the form. Closed, it does.
        if (!open) break;
        event.preventDefault();
        if (activeOption !== undefined) choose(activeOption);
        break;
      case "Escape":
        if (!open) break;
        event.preventDefault();
        close();
        break;
    }
  }

  function handleScroll(event: UIEvent<HTMLUListElement>) {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - LOAD_MORE_THRESHOLD_PX) loadMore();
  }

  let status: string;
  if (assignable.isError) status = "Could not load users.";
  else if (assignable.data === undefined) status = "Loading…";
  else if (users.length === 0) status = search === "" ? "No users to assign." : `No users match “${search}”.`;
  else status = `Showing ${users.length} of ${total}`;

  return (
    <div className="mb-4">
      <label id={labelId} htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="Unassigned"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          value={query ?? (value === null ? "" : userLabel(value))}
          onChange={(event) => store.actions.type(event.target.value)}
          onClick={openList}
          onKeyDown={handleKeyDown}
          onBlur={close}
          className="w-full rounded border border-slate-300 px-3 py-2"
        />
        {open && (
          // Every mouse press inside the popup keeps focus on the input, so
          // choosing, scrolling or loading more never blurs (and closes) it.
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="absolute z-10 mt-1 w-full rounded border border-slate-300 bg-white shadow-lg"
          >
            <ul
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              onScroll={handleScroll}
              className="max-h-64 overflow-y-auto py-1"
            >
              {options.map((option, index) => (
                <li
                  key={option === null ? "none" : option.id}
                  id={optionId(option)}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => choose(option)}
                  className={
                    index === active
                      ? "cursor-pointer bg-slate-100 px-3 py-2 text-sm"
                      : "cursor-pointer px-3 py-2 text-sm"
                  }
                >
                  {option === null ? "Unassigned" : userLabel(option)}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
              <p aria-live="polite" className="text-sm text-slate-500">
                {status}
              </p>
              {assignable.hasNextPage && (
                // Out of the Tab order: keyboard users load more by arrowing
                // to the end of the list.
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={assignable.isFetchingNextPage}
                  onClick={loadMore}
                  className={buttonClasses("secondary", "sm")}
                >
                  {assignable.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
