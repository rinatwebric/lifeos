import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { GoalsPage } from "@/features/goals/GoalsPage";
import { HabitsPage } from "@/features/habits/HabitsPage";
import { NotFoundPage } from "@/features/misc/NotFoundPage";
import { PlannerPage } from "@/features/planner/PlannerPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { TasksPage } from "@/features/tasks/TasksPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
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
