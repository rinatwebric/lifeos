import type { ProposalAction } from "@/lib/aiProposals";
import { tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useMessages } from "@/lib/i18n/I18nContext";

import { describeProposalAction } from "./describeAction";

interface ProposalActionRowProps {
  action: ProposalAction;
  index: number;
  checked: boolean;
  disabled?: boolean;
  timeZone: string;
  onToggle: (index: number, next: boolean) => void;
}

/**
 * One proposal action: a checkbox plus the human-readable consequence.
 * Presentation only — wording comes from `describeProposalAction`.
 */
export function ProposalActionRow({
  action,
  index,
  checked,
  disabled = false,
  timeZone,
  onToggle,
}: ProposalActionRowProps) {
  const m = useMessages();
  const intl = useIntlLocale();
  const labelId = `proposal-action-${index}`;
  const description = describeProposalAction(action, timeZone, m.assistant, intl);

  return (
    <li className="flex min-h-11 items-start gap-3 rounded-control bg-surface-muted p-4">
      <input
        id={labelId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(index, event.target.checked)}
        aria-label={tmpl(m.assistant.selectAction, { index: index + 1, description })}
        className="mt-0.5 size-5 shrink-0 accent-current"
      />
      <label htmlFor={labelId} className="min-w-0 flex-1 cursor-pointer space-y-1">
        <span className="block text-ui font-medium break-words text-content text-pretty">
          {description}
        </span>
        <span className="block text-micro break-words text-muted">
          {action.type.replaceAll("_", " ")}
        </span>
      </label>
    </li>
  );
}
