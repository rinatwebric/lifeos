import { CalendarClock, Pencil, Trash2 } from "lucide-react";

import { ActionMenu } from "@/components/ui/ActionMenu";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

interface TaskActionsMenuProps {
  task: Task;
  onEdit: (task: Task) => void;
  onReschedule: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** Task-specific labels over the shared compact action menu. */
export function TaskActionsMenu({ task, onEdit, onReschedule, onDelete }: TaskActionsMenuProps) {
  const t = useMessages().tasks;

  return (
    <ActionMenu
      label={t.actions}
      items={[
        { label: t.edit, icon: Pencil, onSelect: () => onEdit(task) },
        { label: t.reschedule, icon: CalendarClock, onSelect: () => onReschedule(task) },
        {
          label: t.delete,
          ariaLabel: tmpl(t.deleteAria, { title: task.title }),
          icon: Trash2,
          danger: true,
          onSelect: () => onDelete(task),
        },
      ]}
    />
  );
}
