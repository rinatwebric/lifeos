import { isSupabaseConfigured } from "@/lib/env";
import { useMessages } from "@/lib/i18n/I18nContext";

export function SetupBanner() {
  const m = useMessages();

  if (isSupabaseConfigured) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-line bg-surface-muted px-4 py-2 text-micro text-muted sm:px-6 lg:px-8"
    >
      <span className="font-medium text-content">{m.layout.setupConnected}</span> {m.layout.setupCopyPrefix}{" "}
      <code className="rounded bg-canvas px-1 py-0.5">.env.example</code> {m.layout.setupCopyMiddle}{" "}
      <code className="rounded bg-canvas px-1 py-0.5">.env.local</code> {m.layout.setupCopySuffix}
    </div>
  );
}
