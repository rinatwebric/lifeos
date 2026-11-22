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
      className="px-4 py-2 text-[13px] leading-5 text-muted sm:px-6 lg:px-8"
    >
      <span className="font-medium text-content">{m.layout.setupConnected}</span> {m.layout.setupCopyPrefix}{" "}
      <code className="text-content">.env.example</code> {m.layout.setupCopyMiddle}{" "}
      <code className="text-content">.env.local</code> {m.layout.setupCopySuffix}
    </div>
  );
}
