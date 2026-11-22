import { Pause, Pencil, Play, Trash2 } from "lucide-react";

import { ActionMenu } from "@/components/ui/ActionMenu";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Habit } from "@/types/domain";

interface HabitActionsMenuProps {
  habit: Habit;
  onEdit: (habit: Habit) => void;
  onTogglePause: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}

/** Secondary habit actions stay out of the row until they are needed. */
export function HabitActionsMenu({
  habit,
  onEdit,
  onTogglePause,
  onDelete,
}: HabitActionsMenuProps) {
  const t = useMessages().habits.row;
  const resumable = habit.status === "paused" || habit.status === "archived";

  return (
    <ActionMenu
      label={tmpl(t.actionsAria, { title: habit.title })}
      items={[
        { label: t.edit, icon: Pencil, onSelect: () => onEdit(habit) },
        {
          label: resumable ? t.resume : t.pause,
          ariaLabel: tmpl(resumable ? t.resumeAria : t.pauseAria, { title: habit.title }),
          icon: resumable ? Play : Pause,
          onSelect: () => onTogglePause(habit),
        },
        {
          label: t.delete,
          ariaLabel: tmpl(t.deleteAria, { title: habit.title }),
          icon: Trash2,
          danger: true,
          onSelect: () => onDelete(habit),
        },
      ]}
    />
  );
}
