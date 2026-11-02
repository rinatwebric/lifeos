import { Globe2, Languages, Moon, Settings as SettingsIcon } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const browserLanguage = typeof navigator === "undefined" ? "en" : navigator.language;
const prefersDark =
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

const rows = [
  { icon: Globe2, label: "Time zone", value: browserTimeZone },
  { icon: Languages, label: "Language", value: browserLanguage },
  { icon: Moon, label: "Theme", value: prefersDark ? "Dark (from system)" : "Light (from system)" },
];

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Profile, time zone, working hours and preferences. Values below are detected from this browser until the profile module is connected."
      />

      <Card className="divide-y divide-line p-0">
        {rows.map((row) => {
          const Icon = row.icon;

          return (
            <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 text-muted" aria-hidden="true" />
                <span className="text-sm text-content">{row.label}</span>
              </div>
              <span className="text-sm text-muted">{row.value}</span>
            </div>
          );
        })}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-muted p-4">
        <SettingsIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-xs text-muted">
          Editable settings (full name, avatar, wake-up and sleep time, working and study hours,
          notification preferences, EN/RU/KY localization) arrive with the profile module in Phase 1.
        </p>
      </div>
    </div>
  );
}