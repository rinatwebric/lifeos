import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { cn } from "@/lib/cn";
import { formatLongDate, localDateTimeToIso, toDateKey } from "@/lib/dates";

import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { isValidDateKey, shiftDateKey, usePlannerDay } from "./usePlannerDay";
import { plannerWeekLabel, usePlannerWeek } from "./usePlannerWeek";

/**
 * The planner keeps its whole state in the URL:
 * `/planner?view=day|week&date=YYYY-MM-DD`. Both parameters are always
 * written, so every screen is a shareable link, the browser back button steps
 * through the days and weeks a user visited, and the week view can open a day
 * without extra client state.
 */
const DATE_PARAM = "date";
const VIEW_PARAM = "view";

export type PlannerView = "day" | "week";

const VIEW_OPTIONS: readonly { value: PlannerView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
];

/** Anything that is not an explicit `week` is the day view (the default). */
function readPlannerView(value: string | null | undefined): PlannerView {
  return value === "week" ? "week" : "day";
}

function plannerHref(view: PlannerView, dateKey: string): string {
  return `/planner?${VIEW_PARAM}=${view}&${DATE_PARAM}=${dateKey}`;
}

function ViewSwitch({ view, dateKey }: { view: PlannerView; dateKey: string }) {
  return (
    <nav
      aria-label="Planner view"
      className="flex items-center gap-1 rounded-control bg-surface-muted p-1"
    >
      {VIEW_OPTIONS.map((option) => {
        const isActive = option.value === view;

        return (
          <Link
            key={option.value}
            to={plannerHref(option.value, dateKey)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 min-w-16 items-center justify-center rounded-control px-3 text-ui",
              "transition-[color,background-color] duration-fast ease-standard",
              isActive
                ? "bg-accent font-semibold text-accent-content"
                : "font-medium text-muted hover:bg-surface hover:text-content",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Next step offered by both empty states (PRD §9.4). */
function OpenTasksLink() {
  return (
    <Link
      to="/tasks"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-ui font-medium text-content underline underline-offset-4 hover:bg-surface-muted"
    >
      Open tasks
    </Link>
  );
}

interface PlannerSectionProps {
  dateKey: string;
  now: Date;
}

/**
 * Both views need their own blocks range, so each one lives in its own
 * component: switching the view mounts exactly one of them and only that one
 * issues a request. Mounting both and hiding one would query the week while
 * the user reads a day.
 */
function PlannerDaySection({ dateKey, now }: PlannerSectionProps) {
  const { day, isLoading, isError, retry } = usePlannerDay({ dateKey, now });

  return (
    <DayView
      day={day}
      isLoading={isLoading}
      isError={isError}
      onRetry={retry}
      emptyAction={<OpenTasksLink />}
    />
  );
}

function PlannerWeekSection({ dateKey, now }: PlannerSectionProps) {
  const { week, isLoading, isError, retry } = usePlannerWeek({ dateKey, now });

  return (
    <WeekView
      week={week}
      isLoading={isLoading}
      isError={isError}
      onRetry={retry}
      dayHref={(dayKey) => plannerHref("day", dayKey)}
      emptyAction={<OpenTasksLink />}
    />
  );
}

export function PlannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Same query key as both planner hooks: one profile read, shared by all.
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";

  const now = new Date();
  const todayKey = toDateKey(now, timeZone);
  const requestedDate = searchParams.get(DATE_PARAM);
  const dateKey = isValidDateKey(requestedDate) ? requestedDate : todayKey;
  const view = readPlannerView(searchParams.get(VIEW_PARAM));
  const isToday = dateKey === todayKey;

  const goTo = (nextView: PlannerView, nextDateKey: string): void => {
    setSearchParams({ [VIEW_PARAM]: nextView, [DATE_PARAM]: nextDateKey });
  };

  // A day steps one day, a week steps seven: the arrow keeps the meaning the
  // header promises ("previous day" / "previous week").
  const stepDays = view === "week" ? 7 : 1;
  const period = view === "week" ? "week" : "day";

  // Noon probe: the calendar date rendered in `timeZone`, never shifted by DST.
  const selectedDate = new Date(localDateTimeToIso(`${dateKey}T12:00`, timeZone));
  const title =
    view === "week" ? plannerWeekLabel(dateKey, timeZone) : formatLongDate(selectedDate, timeZone);
  const description =
    view === "week"
      ? "Seven days at a glance: how much each day holds and where the blocks collide."
      : "Everything scheduled on this day, with the time still free for planning.";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewSwitch view={view} dateKey={dateKey} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                aria-label={`Previous ${period}`}
                onClick={() => goTo(view, shiftDateKey(dateKey, -stepDays))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                aria-label={`Next ${period}`}
                onClick={() => goTo(view, shiftDateKey(dateKey, stepDays))}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                disabled={isToday}
                onClick={() => goTo(view, todayKey)}
              >
                Today
              </Button>
            </div>
          </div>
        }
      />

      {view === "week" ? (
        <PlannerWeekSection dateKey={dateKey} now={now} />
      ) : (
        <PlannerDaySection dateKey={dateKey} now={now} />
      )}
    </div>
  );
}
