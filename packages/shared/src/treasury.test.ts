import { describe, expect, it } from "vitest";
import {
  createTreasurySchema,
  depositIntentSchema,
  withdrawTreasurySchema,
} from "./onboarding.js";

describe("treasury request schemas", () => {
  it("requires a positive integer base-unit deposit amount", () => {
    expect(depositIntentSchema.safeParse({ amount: "1000000" }).success).toBe(
      true,
    );
    expect(depositIntentSchema.safeParse({ amount: "1.25" }).success).toBe(
      false,
    );
    expect(depositIntentSchema.safeParse({ amount: "0" }).success).toBe(false);
  });

  it("validates owner withdrawal signature data and recipient", () => {
    const valid = {
      amount: "1000000",
      recipient: "0x0000000000000000000000000000000000000001",
      nonce: "42",
      deadline: 1_900_000_000,
      signature: `0x${"11".repeat(65)}`,
    };
    expect(withdrawTreasurySchema.safeParse(valid).success).toBe(true);
    expect(
      withdrawTreasurySchema.safeParse({ ...valid, recipient: "bad" }).success,
    ).toBe(false);
  });

  it("requires a positive chain ID and EVM token address", () => {
    const valid = {
      organizationId: "org-1",
      chainId: 143,
      tokenAddress: "0x0000000000000000000000000000000000000001",
    };
    expect(createTreasurySchema.safeParse(valid).success).toBe(true);
    expect(
      createTreasurySchema.safeParse({ ...valid, chainId: 0 }).success,
    ).toBe(false);
  });
});
