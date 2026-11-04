import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateMilestone, useUpdateMilestone } from "@/features/goals/hooks";
import { createMilestoneFormSchema } from "@/features/goals/schema";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import { useRevalidateOnLocaleChange } from "@/lib/i18n/useRevalidate";
import type { Milestone } from "@/types/domain";

interface MilestoneFormDialogProps {
  open: boolean;
  onClose: () => void;
  goalId: string;
  /** `null` → create mode; a milestone → edit mode. */
  milestone: Milestone | null;
}

const nullIfEmpty = (value: unknown): string | null | unknown =>
  value === "" ? null : value;

export function MilestoneFormDialog({ open, onClose, goalId, milestone }: MilestoneFormDialogProps) {
  const m = useMessages();
  const t = m.goals;
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      createMilestoneFormSchema({
        titleRequired: m.validation.titleRequired,
        titleTooLong: m.validation.titleTooLong,
        descriptionTooLong: m.validation.descriptionTooLong,
        dateFormat: m.validation.dateFormat,
      }),
    [m.validation],
  );

  type Values = { title: string; description: string | null | undefined; targetDate: string | null | undefined };

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues: milestone
      ? { title: milestone.title, description: milestone.description, targetDate: milestone.targetDate }
      : { title: "", description: null, targetDate: null },
  });

  useRevalidateOnLocaleChange(trigger, Object.keys(errors).length > 0);

  // RHF reads `defaultValues` only on first mount, but this dialog stays
  // mounted while `milestone`/`open` change. Re-sync on every open so Edit
  // shows the selected milestone and a fresh create never reuses old values.
  // Server errors are cleared in `handleClose`/submit instead, keeping this
  // effect free of synchronous setState.
  useEffect(() => {
    if (open) {
      reset(
        milestone
          ? { title: milestone.title, description: milestone.description, targetDate: milestone.targetDate }
          : { title: "", description: null, targetDate: null },
      );
    }
  }, [open, milestone, reset]);

  const saving = createMilestone.isPending || updateMilestone.isPending;

  const handleClose = (): void => {
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: Values): Promise<void> => {
    setServerError(null);
    try {
      if (milestone) {
        await updateMilestone.mutateAsync({ id: milestone.id, goalId, patch: values });
      } else {
        await createMilestone.mutateAsync({ goalId, ...values });
      }
      handleClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t.saveMilestoneError);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={milestone ? tmpl(t.milestoneEditTitle, { title: milestone.title }) : t.milestoneNewTitle}
      description={milestone ? t.milestoneEditDescription : t.milestoneNewDescription}
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="milestone-title" label={t.milestoneTitle} required error={errors.title?.message}>
          <Input data-autofocus placeholder={t.milestoneTitlePlaceholder} {...register("title")} />
        </Field>

        <Field id="milestone-description" label={t.milestoneDescription} error={errors.description?.message}>
          <Textarea
            placeholder={t.milestoneDescriptionPlaceholder}
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <Field
          id="milestone-targetDate"
          label={t.milestoneTargetDate}
          hint={t.milestoneTargetHint}
          error={errors.targetDate?.message}
        >
          <Input type="date" {...register("targetDate", { setValueAs: nullIfEmpty })} />
        </Field>

        {serverError ? (
          <p role="alert" className="text-micro text-danger">
            {serverError}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {milestone ? t.saveMilestone : t.createMilestone}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
