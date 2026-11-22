import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { CommandPalette } from "@/components/layout/CommandPalette";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/features/auth/useAuth";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { OnboardingDialog } from "@/features/settings/OnboardingDialog";
import { isSupabaseConfigured } from "@/lib/env";
import { useMessages } from "@/lib/i18n/I18nContext";

export function AppLayout() {
  const { status } = useAuth();
  const m = useMessages();
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        if (document.querySelector("dialog[open]")) return;
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Hint, not a gate: only decides whether the one-step dialog mounts.
  // Routes stay reachable regardless; Save/Skip write `onboarded_at`.
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled: status === "authenticated" && isSupabaseConfigured,
    staleTime: 60_000,
  });

  const showOnboarding = status === "authenticated" && profileQuery.data?.onboardedAt === null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-content lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:h-9 focus:items-center focus:rounded-pill focus:bg-content focus:px-4 focus:text-ui focus:font-medium focus:text-canvas"
      >
        {m.layout.skipToContent}
      </a>
      <Sidebar onOpenSearch={() => setCommandOpen(true)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader onOpenSearch={() => setCommandOpen(true)} />
        <SetupBanner />

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-14"
        >
          <div key={location.pathname} className="motion-page">
            <Outlet />
          </div>
        </main>

        <MobileNav />
      </div>

      {commandOpen ? <CommandPalette onClose={() => setCommandOpen(false)} /> : null}
      {showOnboarding ? <OnboardingDialog /> : null}
    </div>
  );
}
