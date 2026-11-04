import { useEffect, useRef } from "react";

import { useLocale } from "./I18nContext";

/**
 * Re-validates an open form when the language changes so already-visible
 * validation errors switch language without a resubmit. Only triggers when
 * the form already shows errors — untouched forms stay clean.
 */
export function useRevalidateOnLocaleChange(
  trigger: () => Promise<unknown>,
  hasErrors: boolean,
): void {
  const locale = useLocale();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    if (hasErrors) {
      void trigger();
    }
  }, [locale, hasErrors, trigger]);
}
