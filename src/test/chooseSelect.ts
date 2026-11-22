import { screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * Open the custom listbox and choose an option by its value. The native
 * `<select>` remains the form value, but users (and tests) interact with the
 * visible combobox, not the hidden element.
 */
export async function chooseSelect(
  user: UserEvent,
  control: HTMLElement,
  value: string,
): Promise<void> {
  await user.click(control);
  const listbox = await screen.findByRole("listbox");
  await waitFor(() => {
    if (
      !Array.from(listbox.querySelectorAll("[data-value]")).some(
        (node) => node.getAttribute("data-value") === value,
      )
    ) {
      throw new Error(`Option "${value}" not ready in ${listbox.textContent ?? "listbox"}`);
    }
  });
  const option = Array.from(listbox.querySelectorAll<HTMLElement>("[data-value]")).find(
    (node) => node.getAttribute("data-value") === value,
  );
  if (!option) throw new Error(`Option "${value}" not found`);
  await user.click(option);
}
