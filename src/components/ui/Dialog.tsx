import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Native `<dialog>` wrapper. `showModal()` gives Esc handling and a top-layer
 * backdrop for free; a window keydown listener covers jsdom (no native
 * cancel event there) and backdrop clicks close via `target === dialog`.
 * Focus returns to the element that opened the dialog.
 */
export function Dialog({ open, onClose, title, description, children, wide }: DialogProps) {
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

    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
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
  }, [open ]);

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
      className={`rounded-xl border border-line bg-surface p-0 text-content shadow-xl backdrop:bg-black/50 ${
        wide ? "w-full max-w-2xl" : "w-full max-w-lg"
      }`}
    >
      <div className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
