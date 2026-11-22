import { CalendarClock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type Ref } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

interface TaskActionsMenuProps {
  task: Task;
  onEdit: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onDelete: (task: Task) => void;
}

interface MenuItemProps {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  ariaLabel?: string;
  danger?: boolean;
  onClick: () => void;
  itemRef?: Ref<HTMLButtonElement>;
}

function MenuItem({
  icon: Icon,
  label,
  ariaLabel,
  danger = false,
  onClick,
  itemRef,
}: MenuItemProps) {
  return (
    <button
      ref={itemRef}
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2.5 rounded-[calc(var(--radius-control)-0.25rem)] px-2.5 text-left text-ui transition-colors duration-fast ease-standard",
        "focus:bg-surface-muted focus-visible:outline-none",
        danger ? "text-danger hover:bg-danger-subtle" : "text-content hover:bg-surface-muted",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** A compact, labelled task menu: one trigger instead of three wide buttons. */
export function TaskActionsMenu({ task, onEdit, onReschedule, onDelete }: TaskActionsMenuProps) {
  const m = useMessages();
  const t = m.tasks;
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

  const run = (action: (task: Task) => void): void => {
    setOpen(false);
    action(task);
  };

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        className="size-10 shrink-0 p-0 text-muted hover:bg-surface-muted hover:text-content"
        aria-label={t.actions}
        title={t.actions}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={t.actions}
          className="absolute top-full right-0 z-30 mt-1.5 w-44 rounded-control border border-line bg-surface p-1 shadow-overlay"
        >
          <MenuItem
            icon={Pencil}
            label={t.edit}
            itemRef={firstItemRef}
            onClick={() => run(onEdit)}
          />
          <MenuItem icon={CalendarClock} label={t.reschedule} onClick={() => run(onReschedule)} />
          <MenuItem
            icon={Trash2}
            label={t.delete}
            ariaLabel={tmpl(t.deleteAria, { title: task.title })}
            danger
            onClick={() => run(onDelete)}
          />
        </div>
      ) : null}
    </div>
  );
}
