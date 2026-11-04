import { describe, expect, it } from "vitest";
import {
  createCapabilitySchema,
  createTreasurySchema,
  delegateCapabilitySchema,
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

describe("capability request schemas", () => {
  const base = {
    organizationId: "org-1",
    treasuryId: "treasury-1",
    agentId: "agent-1",
    budget: "1000000",
    maxPerTransaction: "100000",
    validAfter: 1_800_000_000,
    validUntil: 1_900_000_000,
    allowedTokens: ["0x0000000000000000000000000000000000000001"],
    policyHash: `0x${"11".repeat(32)}`,
  };

  it("accepts bounded root capabilities and defaults delegation off", () => {
    const parsed = createCapabilitySchema.parse(base);
    expect(parsed.canDelegate).toBe(false);
    expect(parsed.maxPerTransaction).toBe("100000");
  });

  it("rejects per-transaction authority greater than the budget", () => {
    expect(
      createCapabilitySchema.safeParse({
        ...base,
        maxPerTransaction: "2000000",
      }).success,
    ).toBe(false);
  });

  it("validates delegated capability fields", () => {
    expect(
      delegateCapabilitySchema.safeParse({
        organizationId: "org-1",
        childAgentId: "agent-child",
        childBudget: "1000",
        childMaxPerTransaction: "200",
        childExpiry: 1_900_000_000,
        allowedTokens: base.allowedTokens,
        policyHash: base.policyHash,
      }).success,
    ).toBe(true);
  });
});
