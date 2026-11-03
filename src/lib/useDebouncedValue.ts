import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`: updates propagate only after the
 * value stays unchanged for the whole delay. Used for search inputs so a
 * query fires once per pause, not once per keystroke. The default 300ms
 * matches the filters across Goals and Tasks.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
