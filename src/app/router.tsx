import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { CheckEmailPage } from "@/features/auth/CheckEmailPage";
import { RedirectIfAuthed, RequireAuth } from "@/features/auth/RequireAuth";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { AuthLayout } from "@/features/auth/AuthLayout";
import { useAuth } from "@/features/auth/useAuth";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { HabitsPage } from "@/features/habits/HabitsPage";
import { NotFoundPage } from "@/features/misc/NotFoundPage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TasksPage } from "@/features/tasks/TasksPage";

/**
 * Picks the reset-password mode from the session. A recovery link establishes
 * a session (via `exchangeCodeFromUrl` in the provider), so an authenticated
 * visitor sets a new password while an anonymous one requests the email.
 * The `key` remounts when the status flips (loading → authenticated) so the
 * correct mode renders after the code exchange.
 */
function ResetPasswordRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div role="status" className="text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <ResetPasswordPage
      key={status}
      initialMode={status === "authenticated" ? "update" : "request"}
    />
  );
}

const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        path: "/sign-in",
        element: (
          <RedirectIfAuthed>
            <SignInPage />
          </RedirectIfAuthed>
        ),
      },
      {
        path: "/sign-up",
        element: (
          <RedirectIfAuthed>
            <SignUpPage />
          </RedirectIfAuthed>
        ),
      },
      {
        path: "/check-email",
        element: (
          <RedirectIfAuthed>
            <CheckEmailPage />
          </RedirectIfAuthed>
        ),
      },
      { path: "/reset-password", element: <ResetPasswordRoute /> },
    ],
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "goals", element: <GoalsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "planner", element: <PlannerPage /> },
      { path: "habits", element: <HabitsPage /> },
      { path: "analytics", element: <AnalyticsPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
