import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PreferencesForm } from "./PreferencesForm";
import { AvailabilityForm } from "./AvailabilityForm";
import {
  getPreferences,
  getProfile,
  preferencesQueryKey,
  profileQueryKey,
  updateProfile,
} from "./api";
import { profileFormSchema, type ProfileFormValues } from "./schemas";
import { useAuth } from "@/features/auth/useAuth";
import { signOut } from "@/features/auth/api";
import { listGoals } from "@/features/goals/api";
import { listHabits } from "@/features/habits/api";
import { listAllTasksForExport } from "@/features/tasks/api";
import { zodResolver } from "@/features/auth/resolver";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/cn";
import { toWallTime } from "@/lib/dates";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

export const SETTINGS_COPY = {
  title: "Settings",
  description: "Profile, time zone, working hours and preferences.",
  emailLabel: "Email",
  emailHint: "Sign-in email. It cannot be changed here.",
  nameLabel: "Full name",
  namePlaceholder: "Ada Lovelace",
  languageLabel: "Language",
  languageHint: "Stored in your profile. Interface translation lands in a later iteration.",
  themeLabel: "Theme",
  profileSubmit: "Save profile",
  profileSaving: "Saving…",
  profileSaved: "Profile saved.",
  loading: "Loading settings…",
  loadError: "Could not load settings.",
  retry: "Retry",
  notConfigured: "Supabase is not connected, so settings are unavailable.",
  signOutTitle: "Sign out",
  signOutHint: "Ends the session on this device. You can sign in again any time.",
  signOut: "Sign out",
  signingOut: "Signing out…",
  signOutFailed: "Could not sign out. Please try again.",
} as const;

/**
 * Section headings plus the two grouping hints the dictionaries do not own.
 * Every field label, field hint, status and action still comes from i18n.
 */
const SECTION_COPY = {
  en: {
    profile: "Profile",
    profileHint: "Your name and sign-in email.",
    daySetup: "Day setup",
    daySetupHint: "Time zone, wake-up and sleep.",
  },
  ru: {
    profile: "Профиль",
    profileHint: "Имя и email для входа.",
    daySetup: "Распорядок дня",
    daySetupHint: "Часовой пояс, подъём и сон.",
  },
} as const;

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-[15px] leading-snug font-medium text-content">{title}</h2>
      <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">{hint}</p>
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("h-3 rounded-full bg-surface-muted", className)} />;
}

function SettingsSkeleton({ label }: { label: string }) {
  return (
    <Card className="space-y-5 p-6">
      <p role="status" className="text-caption text-muted">
        {label}
      </p>
      <div className="space-y-4">
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-4/5" />
        <SkeletonLine className="w-2/3" />
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const m = useMessages();
  const t = m.settings;
  const locale = useLocale();
  const sections = SECTION_COPY[locale];
  const { status, user } = useAuth();
  const queryClient = useQueryClient();

  const enabled = status === "authenticated" && isSupabaseConfigured;

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    enabled,
    staleTime: 60_000,
  });
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    enabled,
    staleTime: 60_000,
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} description={t.description} />
        <Card className="p-6">
          <p role="status" className="text-caption text-muted">
            {t.notConfigured}
          </p>
        </Card>
      </div>
    );
  }

  if (profileQuery.isPending || preferencesQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} description={t.description} />
        <SettingsSkeleton label={t.loading} />
      </div>
    );
  }

  if (
    profileQuery.isError ||
    preferencesQuery.isError ||
    !profileQuery.data ||
    !preferencesQuery.data
  ) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} description={t.description} />
        <Card className="flex flex-col items-start gap-4 p-6">
          <p role="alert" className="text-caption text-danger">
            {t.loadError}
          </p>
          <Button
            variant="secondary"
            className="min-h-11"
            type="button"
            onClick={() => {
              void profileQuery.refetch();
              void preferencesQuery.refetch();
            }}
          >
            {m.common.retry}
          </Button>
        </Card>
      </div>
    );
  }

  const profile = profileQuery.data;
  const preferences = preferencesQuery.data;
  // PostgREST serializes `time` columns as "HH:MM:SS": normalize before the
  // values reach `PreferencesForm` (`input[type=time]` + strict zod would
  // otherwise reject its own defaults on save). Fallbacks match onboarding.
  const wakeUpTime = toWallTime(preferences.wakeUpTime) ?? "07:00";
  const sleepTime = toWallTime(preferences.sleepTime) ?? "23:00";

  return (
    <div className="space-y-6 sm:space-y-7">
      <PageHeader title={t.title} description={t.description} />

      <Card className="space-y-5 p-6">
        <SectionHeading title={sections.profile} hint={sections.profileHint} />

        <div className="space-y-4">
          <Field id="settings-email" label={t.emailLabel} hint={t.emailHint}>
            <Input
              type="email"
              readOnly
              value={user?.email ?? ""}
              className="min-h-11 bg-surface-muted text-muted"
            />
          </Field>

          {/* Stable key: account only. Language/theme changes must never remount
              the name field (draft wipe + focus loss). */}
          <ProfileNameForm
            key={`profile-name-${profile.id}`}
            defaultValues={{ fullName: profile.fullName ?? "" }}
            invalidate={() => queryClient.invalidateQueries({ queryKey: profileQueryKey })}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <SectionHeading title={sections.daySetup} hint={sections.daySetupHint} />
        <PreferencesForm
          key={`prefs-${profile.id}-${profile.timezone}-${wakeUpTime}-${sleepTime}`}
          defaultValues={{
            timezone: profile.timezone,
            wakeUpTime,
            sleepTime,
          }}
          idPrefix="settings"
        />
      </Card>

      <Card className="p-6">
        <AvailabilityForm />
      </Card>

      <ExportDataCard />

      <SignOutCard />
    </div>
  );
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Excel treats a leading =, +, - or @ as a formula. Prefixing an apostrophe
  // keeps the text inert without changing what the user reads.
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * One portable snapshot: tasks, goals and habits share a header plus a
 * `record_type` column, so the file needs no custom parser downstream.
 */
function ExportDataCard() {
  const t = useMessages().settings;
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const exportCsv = async (): Promise<void> => {
    if (state === "loading") return;
    setState("loading");
    try {
      const [tasks, goals, habits] = await Promise.all([
        listAllTasksForExport(),
        listGoals(),
        listHabits(),
      ]);
      const header = [
        "record_type",
        "title",
        "status",
        "priority",
        "category",
        "due_date",
        "start_date",
        "target_date",
        "frequency",
        "target_count",
        "reminder_time",
      ];
      const rows: (string | null)[][] = [
        ...tasks.map((task) => [
          "task",
          task.title,
          task.status,
          task.priority,
          "",
          task.dueDate,
          task.scheduledStart ?? "",
          "",
          "",
          "",
          "",
        ]),
        ...goals.map((goal) => [
          "goal",
          goal.title,
          goal.status,
          goal.priority,
          goal.category,
          "",
          goal.startDate,
          goal.targetDate,
          "",
          "",
          "",
        ]),
        ...habits.map((habit) => [
          "habit",
          habit.title,
          habit.status,
          "",
          "",
          "",
          habit.startDate,
          "",
          habit.frequency,
          String(habit.targetCount),
          habit.reminderTime ?? "",
        ]),
      ];
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lifeos-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1.5">
        <h2 className="text-[15px] leading-snug font-medium text-content">{t.dataTitle}</h2>
        <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">
          {t.dataHint}
        </p>
      </div>
      {state === "error" ? (
        <p role="alert" className="text-caption text-danger">
          {t.exportError}
        </p>
      ) : state === "done" ? (
        <p role="status" className="text-caption text-success">
          {t.exportDone}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 self-start"
        onClick={() => void exportCsv()}
        disabled={state === "loading"}
        loading={state === "loading"}
      >
        {state === "loading" ? t.exporting : t.exportButton}
      </Button>
    </Card>
  );
}

/**
 * Ends the session on this device. No navigation call needed: `signOut`
 * flips the auth status to anonymous and `RequireAuth` redirects to
 * `/sign-in` by itself.
 */
function SignOutCard() {
  const m = useMessages();
  const t = m.settings;
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const onSignOut = async (): Promise<void> => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();
    } catch {
      setSignOutError(t.signOutFailed);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1.5">
        <h2 className="text-[15px] leading-snug font-medium text-content">{t.signOutTitle}</h2>
        <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">
          {t.signOutHint}
        </p>
      </div>

      {signOutError ? (
        <p role="alert" className="text-caption text-danger">
          {signOutError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        className="min-h-11 self-start px-2 hover:bg-surface-muted"
        onClick={() => void onSignOut()}
        disabled={signingOut}
        loading={signingOut}
      >
        <span className="text-danger">{signingOut ? t.signingOut : t.signOut}</span>
      </Button>
    </Card>
  );
}

/** Name-only form. PATCHes `{fullName}` — never language/theme/timezone. */
function ProfileNameForm({
  defaultValues,
  invalidate,
}: {
  defaultValues: Pick<ProfileFormValues, "fullName">;
  invalidate: () => Promise<unknown>;
}) {
  const m = useMessages();
  const t = m.settings;
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Pick<ProfileFormValues, "fullName">>({
    resolver: zodResolver(profileFormSchema.pick({ fullName: true })),
    defaultValues,
  });

  const onSubmit = async (values: Pick<ProfileFormValues, "fullName">): Promise<void> => {
    setServerError(null);
    setSaved(false);

    try {
      const trimmed = values.fullName?.trim();
      await updateProfile({ fullName: trimmed ? trimmed : null });
      await invalidate();
      setSaved(true);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.profileSaved);
    }
  };

  return (
    <form
      noValidate
      aria-busy={isSubmitting || undefined}
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="space-y-4"
    >
      <Field id="settings-name" label={t.nameLabel} error={errors.fullName?.message}>
        <Input
          type="text"
          autoComplete="name"
          placeholder={t.namePlaceholder}
          disabled={isSubmitting}
          className="min-h-11"
          {...register("fullName", { onChange: () => setSaved(false) })}
        />
      </Field>

      {serverError ? (
        <p role="alert" className="text-caption text-danger">
          {serverError}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-caption text-success">
          {t.nameSaved}
        </p>
      ) : null}

      <Button
        type="submit"
        className="min-h-11 w-full sm:w-auto"
        disabled={isSubmitting}
        loading={isSubmitting}
      >
        {isSubmitting ? t.nameSaving : t.nameSubmit}
      </Button>
    </form>
  );
}
