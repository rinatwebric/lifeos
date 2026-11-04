export const LANGUAGE_STORAGE_KEY = "lifeos-language";

interface StoredPreference<T extends string> {
  value: T;
  userId: string | null;
  updatedAt: string;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, raw: string): void {
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Private mode / disabled storage: device copy is best-effort only.
  }
}

/** Reads JSON `{value,userId}` or a legacy plain string. Never throws. */
export function readStoredPreference<T extends string>(
  key: string,
  isValid: (value: unknown) => value is T,
): StoredPreference<T> | null {
  const raw = safeGet(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed === "string" && isValid(parsed)) {
      return { value: parsed, userId: null, updatedAt: "" };
    }

    if (parsed !== null && typeof parsed === "object" && "value" in parsed) {
      const value = (parsed as { value: unknown }).value;

      if (isValid(value)) {
        const record = parsed as Partial<StoredPreference<T>>;
        return {
          value,
          userId: typeof record.userId === "string" ? record.userId : null,
          updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        };
      }
    }
  } catch {
    // Not JSON: fall through to the legacy plain-string check below.
  }

  if (isValid(raw)) {
    return { value: raw, userId: null, updatedAt: "" };
  }

  return null;
}

export function writeStoredPreference<T extends string>(
  key: string,
  value: T,
  userId: string | null,
): void {
  const payload: StoredPreference<T> = {
    value,
    userId,
    updatedAt: new Date().toISOString(),
  };

  safeSet(key, JSON.stringify(payload));
}

export function isLocaleValue(value: unknown): value is "en" | "ru" {
  return value === "en" || value === "ru";
}

export function isThemeValue(value: unknown): value is "light" | "dark" {
  return value === "light" || value === "dark";
}
