import { z } from "zod";

const emailField = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

const newPasswordField = z.string().min(6, "Password must be at least 6 characters.");

/** Sign-in: password rules stay server-side so wrong passwords surface as `invalid_credentials`. */
export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required."),
});

export type SignInValues = z.infer<typeof signInSchema>;

/** Sign-up: name is optional, password strength is enforced up front. */
export const signUpSchema = z.object({
  fullName: z.string().trim().max(80, "Name must be 80 characters or fewer.").optional(),
  email: emailField,
  password: newPasswordField,
});

export type SignUpValues = z.infer<typeof signUpSchema>;

/** Password-reset request: only an email, result copy stays generic (no leak). */
export const requestResetSchema = z.object({
  email: emailField,
});

export type RequestResetValues = z.infer<typeof requestResetSchema>;

/** New password in the recovery flow: confirmation must match. */
export const setNewPasswordSchema = z
  .object({
    password: newPasswordField,
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SetNewPasswordValues = z.infer<typeof setNewPasswordSchema>;
