import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { MobileHeader } from "@/components/layout/MobileHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/features/auth/useAuth";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { OnboardingDialog } from "@/features/settings/OnboardingDialog";
import { isSupabaseConfigured } from "@/lib/env";

export function AppLayout() {
  const { status } = useAuth();

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
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <SetupBanner />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>

        <MobileNav />
      </div>

      {showOnboarding ? <OnboardingDialog /> : null}
    </div>
  );
}
