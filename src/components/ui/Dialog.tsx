import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  /** On phones, dock to the bottom edge as a sheet; desktop keeps the card. */
  sheet?: boolean;
}

/**
 * Native `<dialog>` wrapper. `showModal()` gives Esc handling and a top-layer
 * backdrop for free; a window keydown listener covers only environments
 * without native `showModal` (jsdom) — otherwise Esc would call `onClose`
 * twice (native `close` event + keydown). Backdrop clicks close via
 * `target === dialog`. Focus returns to the element that opened the dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
  sheet = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const nativeSupported = typeof dialog?.showModal === "function";
    if (dialog && !dialog.open) {
      if (nativeSupported) {
        dialog.showModal();
      } else {
        // No native modal (jsdom): expose the dialog to the a11y tree so
        // `getByRole("dialog")` works and the Esc polyfill below can close it.
        dialog.setAttribute("open", "");
      }
    }

    // The dialog focuses its marked first field (or the safe action in
    // confirmations) here — after `previouslyFocused` is captured — instead
    // of React `autoFocus`, which fires before passive effects and would
    // poison focus-restore with an in-dialog node.
    dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    // Native `showModal` already fires `close` on Esc — a manual keydown
    // listener would double-invoke `onClose`. Only polyfill Esc where the
    // native API is missing (e.g. jsdom).
    if (nativeSupported) {
      return () => {
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          previouslyFocused.focus();
        }
      };
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>): void => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={`scrollbar-neutral m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-0 text-content shadow-overlay backdrop:bg-scrim ${
        wide ? "max-w-2xl" : "max-w-lg"
      } ${
        sheet
          ? "max-lg:mt-auto max-lg:mb-0 max-lg:w-full max-lg:max-w-none max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0"
          : ""
      }`}
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id={titleId} className="text-heading font-semibold tracking-[-0.01em] text-balance">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-ui text-muted text-pretty">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
