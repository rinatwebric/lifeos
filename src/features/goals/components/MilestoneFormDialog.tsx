import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateMilestone, useUpdateMilestone } from "@/features/goals/hooks";
import type { Milestone } from "@/types/domain";

const milestoneFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2,000 characters or fewer.")
    .nullable()
    .optional(),
  targetDate: z.iso.date({ error: "Use YYYY-MM-DD." }).nullable().optional(),
});

type MilestoneFormValues = z.infer<typeof milestoneFormSchema>;

interface MilestoneFormDialogProps {
  open: boolean;
  onClose: () => void;
  goalId: string;
  /** `null` → create mode; a milestone → edit mode. */
  milestone: Milestone | null;
}

function defaultValuesFor(milestone: Milestone | null): MilestoneFormValues {
  if (milestone) {
    return {
      title: milestone.title,
      description: milestone.description,
      targetDate: milestone.targetDate,
    };
  }
  return { title: "", description: null, targetDate: null };
}

const nullIfEmpty = (value: unknown): string | null | unknown =>
  value === "" ? null : value;

export function MilestoneFormDialog({ open, onClose, goalId, milestone }: MilestoneFormDialogProps) {
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneFormSchema) as Resolver<MilestoneFormValues>,
    defaultValues: defaultValuesFor(milestone),
  });

  // RHF reads `defaultValues` only on first mount, but this dialog stays
  // mounted while `milestone`/`open` change. Re-sync on every open so Edit
  // shows the selected milestone and a fresh create never reuses old values.
  // Server errors are cleared in `handleClose`/submit instead, keeping this
  // effect free of synchronous setState.
  useEffect(() => {
    if (open) {
      reset(defaultValuesFor(milestone));
    }
  }, [open, milestone, reset]);

  const saving = createMilestone.isPending || updateMilestone.isPending;

  const handleClose = (): void => {
    setServerError(null);
    onClose();
  };

  const onSubmit = async (values: MilestoneFormValues): Promise<void> => {
    setServerError(null);
    try {
      if (milestone) {
        await updateMilestone.mutateAsync({ id: milestone.id, goalId, patch: values });
      } else {
        await createMilestone.mutateAsync({ goalId, ...values });
      }
      handleClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Could not save the milestone.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={milestone ? `Edit ${milestone.title}` : "New milestone"}
      description={
        milestone
          ? "Update the milestone details below."
          : "Break the goal into a concrete first step."
      }
    >
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
        <Field id="milestone-title" label="Title" required error={errors.title?.message}>
          <Input data-autofocus placeholder="Finish chapter 1" {...register("title")} />
        </Field>

        <Field id="milestone-description" label="Description" error={errors.description?.message}>
          <Textarea
            placeholder="What does done look like?"
            {...register("description", { setValueAs: nullIfEmpty })}
          />
        </Field>

        <Field
          id="milestone-targetDate"
          label="Target date"
          hint="Optional."
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
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {milestone ? "Save changes" : "Create milestone"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
