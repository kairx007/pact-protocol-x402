import { describe, expect, it } from "vitest";
import { agentRecordSchema } from "./schemas";

describe("agent API contract", () => {
  it("accepts the backend agent lifecycle values", () => {
    for (const status of ["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"]) {
      expect(agentRecordSchema.shape.status.safeParse(status).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown statuses instead of guessing their meaning", () => {
    expect(agentRecordSchema.shape.status.safeParse("VERIFIED").success).toBe(
      false,
    );
    expect(agentRecordSchema.shape.status.safeParse(undefined).success).toBe(
      false,
    );
  });
});
