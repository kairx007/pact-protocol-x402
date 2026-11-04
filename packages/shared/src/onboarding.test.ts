import { describe, expect, it } from "vitest";
import {
  createOrganizationSchema,
  linkWalletSchema,
  registerAgentSchema,
} from "./onboarding.js";

describe("Phase 2 onboarding schemas", () => {
  it("normalizes and validates an organization slug", () => {
    expect(
      createOrganizationSchema.parse({ name: "PACT Labs", slug: "PACT-Labs" })
        .slug,
    ).toBe("pact-labs");
  });

  it("rejects invalid EVM wallet addresses", () => {
    const result = linkWalletSchema.safeParse({
      address: "not-an-address",
      type: "EOA",
      signature: "0x1234",
      message: "link wallet",
    });
    expect(result.success).toBe(false);
  });

  it("defaults signer support to the EOA MVP", () => {
    const result = registerAgentSchema.parse({
      organizationId: "org-1",
      name: "Research agent",
      registryAddress: "0x0000000000000000000000000000000000008004",
      agentId: "42",
      chainId: 143,
      signerAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(result.signerType).toBe("EOA");
  });

  it("rejects non-decimal agent IDs", () => {
    expect(
      registerAgentSchema.safeParse({
        organizationId: "org-1",
        name: "Research agent",
        registryAddress: "0x0000000000000000000000000000000000008004",
        agentId: "4.2",
        chainId: 143,
        signerAddress: "0x0000000000000000000000000000000000000001",
      }).success,
    ).toBe(false);
  });
});
