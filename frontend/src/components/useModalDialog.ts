import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Keyboard behaviour for a modal dialog (D46), shared by the confirmation
 * dialogs. Attach the returned ref to the element with role="dialog".
 *
 * - On open, focus moves into the dialog: onto the element marked
 *   `data-autofocus` (Cancel, the safe default for a destructive action), or
 *   else the first focusable element.
 * - Escape cancels, unless `canCancel` is false (e.g. while a request is in
 *   flight, when Cancel itself is disabled).
 * - Tab and Shift+Tab wrap inside the dialog instead of escaping to the page
 *   behind it, which aria-modal tells assistive technology is inert.
 * - On close, focus returns to whatever opened the dialog — if it still exists.
 *   A deleted row's button does not, and then focus is left to the page.
 */
export function useModalDialog<T extends HTMLElement>(onCancel: () => void, canCancel = true) {
  const ref = useRef<T>(null);
  // Read the latest values from the key handler without re-running the effect,
  // which would re-focus Cancel and lose track of the opener on every render.
  const onCancelRef = useRef(onCancel);
  const canCancelRef = useRef(canCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
    canCancelRef.current = canCancel;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];

    (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (canCancelRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return ref;
}
