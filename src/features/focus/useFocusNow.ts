import { useEffect, useState } from "react";
import type { FocusSession } from "@/types/domain";

/** One ticking clock shared by the timer and its progress bar. */
export function useFocusNow(session: FocusSession | null): number {
  const [now, setNow] = useState(() => Date.now());
  const paused = session?.pausedAt != null;

  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    const boot = window.setTimeout(tick, 0);
    if (!session || paused) {
      return () => window.clearTimeout(boot);
    }
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(interval);
    };
  }, [session, paused]);

  return now;
}
