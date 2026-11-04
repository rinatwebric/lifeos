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
    <li className="flex items-start gap-3 rounded-control border border-line bg-surface-muted p-3">
      <input
        id={labelId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(index, event.target.checked)}
        aria-label={tmpl(m.assistant.selectAction, { index: index + 1, description })}
        className="mt-1 size-4 shrink-0 accent-current"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-ui font-medium text-content text-pretty">
          {description}
        </p>
        <p className="text-micro text-muted">{action.type.replaceAll("_", " ")}</p>
      </div>
    </li>
  );
}
