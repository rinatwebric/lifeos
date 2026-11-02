import { Outlet } from "react-router-dom";

import { MobileHeader } from "@/components/layout/MobileHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { SetupBanner } from "@/components/layout/SetupBanner";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-content lg:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <SetupBanner />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          <Outlet />
        </main>

        <MobileNav />
      </div>
    </div>
  );
}