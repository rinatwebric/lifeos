import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, updatePreferences } from "./api";
import { AVAILABILITY_COPY, AvailabilityForm } from "./AvailabilityForm";
import { AVAILABILITY_MESSAGES } from "./schemas";
import type { UserPreferences } from "@/types/domain";

vi.mock("./api", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

const mockedGetPreferences = vi.mocked(getPreferences);
const mockedUpdatePreferences = vi.mocked(updatePreferences);

function makePreferences(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    id: "p1",
    userId: "u1",
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    preferredWorkPeriods: {},
    notificationPreferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <AvailabilityForm />
    </QueryClientProvider>,
  );

  return { client, ...view };
}

function startField(day: string, position: number): HTMLElement {
  return screen.getByLabelText(`${day}, window ${position} start time`);
}

function endField(day: string, position: number): HTMLElement {
  return screen.getByLabelText(`${day}, window ${position} end time`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdatePreferences.mockImplementation(async () => makePreferences());
});

describe("AvailabilityForm", () => {
  it("renders the saved windows of each day", async () => {
    mockedGetPreferences.mockResolvedValue(
      makePreferences({
        workingHours: {
          mon: [{ start: "09:00", end: "12:00" }],
          thu: [{ start: "18:00", end: "20:00" }],
        },
      }),
    );

    renderForm();

    expect(await screen.findByLabelText("Monday, window 1 start time")).toHaveValue("09:00");
    expect(endField("Monday", 1)).toHaveValue("12:00");
    expect(startField("Thursday", 1)).toHaveValue("18:00");
    expect(endField("Thursday", 1)).toHaveValue("20:00");
    // Five days stay unset and read as "Not set".
    expect(screen.getAllByText(AVAILABILITY_COPY.emptyDay)).toHaveLength(5);
  });

  it("shows a loading placeholder before the saved week arrives", async () => {
    mockedGetPreferences.mockReturnValue(new Promise(() => {}) as never);

    renderForm();

    expect(screen.getByRole("status")).toHaveTextContent(AVAILABILITY_COPY.loading);
  });

  it("adds a window to a day and removes it again", async () => {
    const user = userEvent.setup();
    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { mon: [{ start: "09:00", end: "12:00" }] } }),
    );

    renderForm();

    const monday = within(await screen.findByRole("group", { name: "Monday" }));
    await user.click(monday.getByRole("button", { name: AVAILABILITY_COPY.addWindow }));

    expect(startField("Monday", 2)).toHaveValue("09:00");
    expect(endField("Monday", 2)).toHaveValue("10:00");

    await user.click(
      screen.getByRole("button", { name: `Remove window: Monday, window 1 start time` }),
    );

    await waitFor(() => expect(screen.queryByLabelText("Monday, window 2 start time")).toBeNull());
    expect(startField("Monday", 1)).toHaveValue("09:00");
    expect(endField("Monday", 1)).toHaveValue("10:00");
  });

  it("saves only the days that have windows and reports success", async () => {
    const user = userEvent.setup();
    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { mon: [{ start: "09:00", end: "12:00" }] } }),
    );

    renderForm();

    await screen.findByLabelText("Monday, window 1 start time");
    fireEvent.change(endField("Monday", 1), { target: { value: "13:00" } });
    await user.click(screen.getByRole("button", { name: AVAILABILITY_COPY.submit }));

    await waitFor(() =>
      expect(mockedUpdatePreferences).toHaveBeenCalledWith({
        workingHours: { mon: [{ start: "09:00", end: "13:00" }] },
      }),
    );
    expect(await screen.findByText(AVAILABILITY_COPY.saved)).toBeInTheDocument();
  });

  it("blocks a save whose window ends before it starts", async () => {
    const user = userEvent.setup();
    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { mon: [{ start: "09:00", end: "12:00" }] } }),
    );

    renderForm();

    await screen.findByLabelText("Monday, window 1 start time");
    fireEvent.change(endField("Monday", 1), { target: { value: "08:00" } });
    await user.click(screen.getByRole("button", { name: AVAILABILITY_COPY.submit }));

    expect(await screen.findByText(AVAILABILITY_MESSAGES.endAfterStart)).toBeInTheDocument();
    expect(mockedUpdatePreferences).not.toHaveBeenCalled();
  });

  it("shows a load error with Retry, separate from the save state", async () => {
    const user = userEvent.setup();
    mockedGetPreferences.mockRejectedValueOnce(new Error("preferences down"));
    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { tue: [{ start: "10:00", end: "11:00" }] } }),
    );

    renderForm();

    expect(await screen.findByText(AVAILABILITY_COPY.loadError)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: AVAILABILITY_COPY.retry }));

    expect(await screen.findByLabelText("Tuesday, window 1 start time")).toHaveValue("10:00");
    expect(screen.queryByText(AVAILABILITY_COPY.loadError)).toBeNull();
  });

  it("reports a save failure with the server message and keeps the edits", async () => {
    const user = userEvent.setup();
    mockedUpdatePreferences.mockRejectedValueOnce(new Error("row is locked"));
    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { mon: [{ start: "09:00", end: "12:00" }] } }),
    );

    renderForm();

    await screen.findByLabelText("Monday, window 1 start time");
    await user.click(screen.getByRole("button", { name: AVAILABILITY_COPY.submit }));

    expect(await screen.findByText(/row is locked/)).toHaveTextContent(
      AVAILABILITY_COPY.saveErrorPrefix,
    );
    expect(startField("Monday", 1)).toHaveValue("09:00");
    expect(screen.queryByText(AVAILABILITY_COPY.saved)).toBeNull();
  });

  it("resets the fields when fresh server data arrives", async () => {
    mockedGetPreferences.mockResolvedValue(makePreferences());
    const { client } = renderForm();

    expect(await screen.findAllByText(AVAILABILITY_COPY.emptyDay)).toHaveLength(7);
    expect(screen.queryByLabelText("Friday, window 1 start time")).toBeNull();

    mockedGetPreferences.mockResolvedValue(
      makePreferences({ workingHours: { fri: [{ start: "15:00", end: "17:00" }] } }),
    );
    await client.refetchQueries({ queryKey: ["preferences"] });

    expect(await screen.findByLabelText("Friday, window 1 start time")).toHaveValue("15:00");
    expect(endField("Friday", 1)).toHaveValue("17:00");
  });
});