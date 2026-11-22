import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type Ref } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface ActionMenuItem {
  label: string;
  /** A more specific accessible name, e.g. "Delete Practice scales". */
  ariaLabel?: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  danger?: boolean;
  onSelect: () => void;
}

interface ActionMenuProps {
  /** Accessible name for the trigger; make it unique per row. */
  label: string;
  items: ActionMenuItem[];
}

function MenuItem({ item, itemRef }: { item: ActionMenuItem; itemRef?: Ref<HTMLButtonElement> }) {
  const Icon = item.icon;

  return (
    <button
      ref={itemRef}
      type="button"
      role="menuitem"
      aria-label={item.ariaLabel}
      onClick={item.onSelect}
      className={cn(
        "flex min-h-10 w-full items-center gap-2.5 rounded-[calc(var(--radius-control)-0.25rem)] px-2.5 text-left text-ui transition-colors duration-fast ease-standard",
        "focus:bg-surface-muted focus-visible:outline-none",
        item.danger ? "text-danger hover:bg-danger-subtle" : "text-content hover:bg-surface-muted",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

/**
 * One compact trigger and a labelled menu. It handles outside clicks, Escape
 * and focus return, so task and habit rows share the same interaction.
 */
export function ActionMenu({ label, items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        className="size-10 shrink-0 p-0 text-muted hover:bg-surface-muted hover:text-content"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="motion-menu absolute top-full right-0 z-30 mt-1.5 w-44 rounded-control border border-line bg-surface p-1 shadow-overlay"
        >
          {items.map((item, index) => (
            <MenuItem
              key={item.label}
              item={{
                ...item,
                onSelect: () => {
                  setOpen(false);
                  item.onSelect();
                },
              }}
              itemRef={index === 0 ? firstItemRef : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
