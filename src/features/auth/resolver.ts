import type { FieldErrors, Resolver, ResolverResult } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * Minimal RHF ↔ Zod bridge so no extra dependency (`@hookform/resolvers`) is
 * needed. Validates with `schema.safeParse` on submit and maps the first
 * issue per field to `{ type, message }`.
 */
export function zodResolver<TValues extends Record<string, unknown>>(
  schema: ZodType<TValues>,
): Resolver<TValues> {
  return (values) => {
    const result = schema.safeParse(values);

    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors = {} as FieldErrors<TValues>;

    for (const issue of result.error.issues) {
      const segment = issue.path[0];

      if (typeof segment !== "string" && typeof segment !== "number") {
        continue;
      }

      const key = String(segment);

      if (key in errors) {
        continue;
      }

      (errors as Record<string, { type: string; message: string }>)[key] = {
        type: issue.code,
        message: issue.message,
      };
    }

    const failure: ResolverResult<TValues> = { values: {}, errors };
    return failure;
  };
}
