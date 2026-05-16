import { describe, expect, it } from "vitest";
import { previewImport } from "../../src/main/services/transferVaultService";

describe("TransferVaultService", () => {
  it("detects email conflicts before import", () => {
    const preview = previewImport({
      incoming: [
        { id: "new_1", email: "a@example.com", label: "A" },
        { id: "new_2", email: "b@example.com", label: "B" }
      ],
      existing: [{ id: "old_1", email: "a@example.com", label: "Old A" }]
    });

    expect(preview.total).toBe(2);
    expect(preview.conflicts).toEqual([{ incomingId: "new_1", existingId: "old_1", email: "a@example.com", reason: "email" }]);
    expect(preview.safeToImport).toEqual([{ id: "new_2", email: "b@example.com", label: "B" }]);
  });
});
