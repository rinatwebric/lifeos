import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";

import { createAssistantSchemas, proposalIdSchema, selectedIndexesSchema } from "./schemas";

const UUID = "9f1c7a55-8b47-4e0e-9d8e-2c1f3f4a5b6c";

function messages(locale: "en" | "ru") {
  const d = locale === "en" ? en : ru;
  return {
    messageRequired: d.validation.messageRequired,
    messageTooLong: d.validation.messageTooLong,
    invalidConversation: d.validation.invalidConversation,
    invalidProposal: d.validation.invalidProposal,
    selectAction: d.validation.selectAction,
    duplicateAction: d.validation.duplicateAction,
    actionOrder: d.validation.actionOrder,
  };
}

describe("assistant schemas i18n", () => {
  it("emits Russian messages without changing accepted values", () => {
    const ruSchemas = createAssistantSchemas(messages("ru"));

    // Static (service-layer) and localized factories agree on shapes.
    expect(proposalIdSchema.safeParse(UUID).success).toBe(true);
    expect(ruSchemas.proposalIdSchema.safeParse(UUID).success).toBe(true);
    expect(proposalIdSchema.safeParse("nope").success).toBe(false);
    expect(ruSchemas.proposalIdSchema.safeParse("nope").success).toBe(false);

    expect(selectedIndexesSchema.safeParse([0, 2]).success).toBe(true);
    expect(ruSchemas.selectedIndexesSchema.safeParse([0, 2]).success).toBe(true);
    expect(selectedIndexesSchema.safeParse([]).success).toBe(false);
    expect(ruSchemas.selectedIndexesSchema.safeParse([]).success).toBe(false);
    expect(selectedIndexesSchema.safeParse([1, 1]).success).toBe(false);
    expect(ruSchemas.selectedIndexesSchema.safeParse([1, 1]).success).toBe(false);
    expect(selectedIndexesSchema.safeParse([2, 1]).success).toBe(false);
    expect(ruSchemas.selectedIndexesSchema.safeParse([2, 1]).success).toBe(false);
  });

  it("reports RU messages for proposal id and selected indexes", () => {
    const ruSchemas = createAssistantSchemas(messages("ru"));

    const badId = ruSchemas.proposalIdSchema.safeParse("nope");
    expect(badId.success).toBe(false);
    if (!badId.success) {
      expect(badId.error.issues[0]?.message).toBe(ru.validation.invalidProposal);
    }

    const empty = ruSchemas.selectedIndexesSchema.safeParse([]);
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe(ru.validation.selectAction);
    }

    const dup = ruSchemas.selectedIndexesSchema.safeParse([1, 1]);
    expect(dup.success).toBe(false);
    if (!dup.success) {
      expect(dup.error.issues[0]?.message).toBe(ru.validation.duplicateAction);
    }

    const unordered = ruSchemas.selectedIndexesSchema.safeParse([2, 1]);
    expect(unordered.success).toBe(false);
    if (!unordered.success) {
      expect(unordered.error.issues[0]?.message).toBe(ru.validation.actionOrder);
    }
  });

  it("reports RU send-message validation messages", () => {
    const ruSchemas = createAssistantSchemas(messages("ru"));

    const empty = ruSchemas.sendMessageSchema.safeParse({ message: "   ", conversationId: null });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe(ru.validation.messageRequired);
    }

    const badConv = ruSchemas.sendMessageSchema.safeParse({ message: "hi", conversationId: "x" });
    expect(badConv.success).toBe(false);
    if (!badConv.success) {
      expect(badConv.error.issues[0]?.message).toBe(ru.validation.invalidConversation);
    }
  });
});
