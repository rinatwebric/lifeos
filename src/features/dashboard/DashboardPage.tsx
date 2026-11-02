import { ArrowRight, CalendarDays, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatLongDate } from "@/lib/dates";

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function SectionPlaceholder({
  title,
  body,
  to,
  linkLabel,
}: {
  title: string;
  body: string;
  to: string;
  linkLabel: string;
}) {
  return (
    <Card className="flex h-full flex-col justify-between gap-4">
      <div className="space-y-1.5">
        <h2 className="text-sm font-medium text-content">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-content underline-offset-4 hover:underline"
      >
        {linkLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </Card>
  );
}

export function DashboardPage() {
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back"
        description={`${formatLongDate(now, browserTimeZone)} · times shown in ${browserTimeZone}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SectionPlaceholder
          title="Today's progress"
          body="No tasks are planned for today yet. Once tasks exist, completion is calculated from real data — never from a fixed percentage."
          to="/tasks"
          linkLabel="Open tasks"
        />
        <SectionPlaceholder
          title="Today's schedule"
          body="Your day view will appear here after the planner is connected to your time preferences."
          to="/planner"
          linkLabel="Open planner"
        />
        <SectionPlaceholder
          title="AI insights"
          body="Insights appear only after there is real activity to analyse. LifeOS never invents productivity numbers."
          to="/assistant"
          linkLabel="Open assistant"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-content">Active goals</h2>
            <Target className="size-4 text-muted" aria-hidden="true" />
          </div>
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            No goals yet. Create a long-term goal and break it into milestones to see progress here.
          </p>
          <Link
            to="/goals"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-content underline-offset-4 hover:underline"
          >
            Go to goals
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-content">Today's tasks</h2>
            <CalendarDays className="size-4 text-muted" aria-hidden="true" />
          </div>
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Nothing scheduled. Tasks you plan for today will be listed here with priority and status.
          </p>
          <Link
            to="/tasks"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-content underline-offset-4 hover:underline"
          >
            Go to tasks
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-muted p-4">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-xs text-muted">
          LifeOS adapts to your life, not the other way around. Every AI suggestion stays a proposal
          until you explicitly approve it.
        </p>
      </div>
    </div>
  );
}