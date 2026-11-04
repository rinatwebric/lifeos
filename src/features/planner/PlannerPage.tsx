import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { formatLongDate, localDateTimeToIso, toDateKey } from "@/lib/dates";

import { DayView } from "./DayView";
import { isValidDateKey, shiftDateKey, usePlannerDay } from "./usePlannerDay";

/**
 * The selected day lives in the URL (`/planner?date=YYYY-MM-DD`), so a day is
 * linkable and the week view (unit 6) can open it without extra state.
 */
const DATE_PARAM = "date";

export function PlannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Same query key as `usePlannerDay`: one profile read, cached for both.
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
  const isToday = dateKey === todayKey;

  const { day, isLoading, isError, retry } = usePlannerDay({ dateKey, now });

  // Noon probe: the calendar date rendered in `timeZone`, never shifted by DST.
  const selectedDate = new Date(localDateTimeToIso(`${dateKey}T12:00`, timeZone));

  const goToDate = (nextDateKey: string): void => {
    const next = new URLSearchParams(searchParams);

    if (nextDateKey === todayKey) {
      next.delete(DATE_PARAM);
    } else {
      next.set(DATE_PARAM, nextDateKey);
    }

    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={formatLongDate(selectedDate, timeZone)}
        description="Everything scheduled on this day, with the time still free for planning."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              aria-label="Previous day"
              onClick={() => goToDate(shiftDateKey(dateKey, -1))}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              aria-label="Next day"
              onClick={() => goToDate(shiftDateKey(dateKey, 1))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={isToday}
              onClick={() => goToDate(todayKey)}
            >
              Today
            </Button>
          </div>
        }
      />

      <DayView
        day={day}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
        emptyAction={
          <Link
            to="/tasks"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-ui font-medium text-content underline underline-offset-4 hover:bg-surface-muted"
          >
            Open tasks
          </Link>
        }
      />
    </div>
  );
}
