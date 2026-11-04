import { z } from "zod";

/**
 * Input contract for one assistant turn (iteration 5, step 6).
 * Mirrors the Edge Function parser (`request.ts`: message 1–4000 chars,
 * `conversationId` uuid-or-null) so both sides agree. `null` starts a new
 * conversation; the server creates the `ai_conversations` row itself.
 */
export const sendMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please write a message before sending.")
    .max(4000, "Your message is too long. Please keep it under 4000 characters."),
  conversationId: z
    .string()
    .uuid("The selected conversation is invalid. Please start a new one.")
    .nullable(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Proposal identity for the step-7 decide calls. The server re-reads the
 * proposal as the caller (RLS; чужой id = 404), so the client sends only the
 * id — never a `user_id`, never the actions (they come from the stored row
 * and are re-validated server-side before the first write).
 */
export const proposalIdSchema = z
  .string()
  .uuid("The selected proposal is invalid. Please reload and try again.");
