import { getAddress } from "viem";
import { z } from "zod";

const evmAddress = z.string().refine((value) => {
  try {
    getAddress(value);
    return true;
  } catch {
    return false;
  }
}, "Expected an EVM address");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(63),
});

export const linkWalletSchema = z.object({
  address: evmAddress,
  type: z.enum(["MERA", "EOA", "SMART_ACCOUNT"]),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  message: z.string().min(1).max(512),
});

export const registerAgentSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  registryAddress: evmAddress,
  agentId: z.string().regex(/^(0|[1-9]\d*)$/),
  chainId: z.number().int().positive(),
  signerAddress: evmAddress,
  signerType: z.literal("EOA").default("EOA"),
});

export const verifyIdentitySchema = z.object({
  organizationId: z.string().min(1),
});

export const rotateAgentSignerSchema = z.object({
  organizationId: z.string().min(1),
  signerAddress: evmAddress,
  signerType: z.literal("EOA").default("EOA"),
  proof: z.string().regex(/^0x[0-9a-fA-F]+$/),
  message: z.string().min(1).max(512),
});

export const createTreasurySchema = z.object({
  organizationId: z.string().min(1),
  chainId: z.number().int().positive(),
  tokenAddress: evmAddress,
});

export const depositIntentSchema = z.object({
  amount: z
    .string()
    .regex(/^[1-9]\d*$/, "Amount must be positive integer base units"),
});

export const withdrawTreasurySchema = z.object({
  amount: z
    .string()
    .regex(/^[1-9]\d*$/, "Amount must be positive integer base units"),
  recipient: evmAddress,
  nonce: z.string().min(1).max(128),
  deadline: z.number().int().positive(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const treasuryIdParamsSchema = z.object({
  treasuryId: z.string().min(1),
});

export const confirmTreasuryTransactionSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

const positiveUint128 = z.string().regex(/^[1-9]\d*$/).refine(
  (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= (1n << 128n) - 1n,
  "Amount exceeds uint128",
);

const amountIsAtMost = (amount: string, maximum: string) =>
  /^[1-9]\d*$/.test(amount) &&
  /^[1-9]\d*$/.test(maximum) &&
  BigInt(amount) <= BigInt(maximum);

export const createCapabilitySchema = z.object({
  organizationId: z.string().min(1),
  treasuryId: z.string().min(1),
  agentId: z.string().min(1),
  budget: positiveUint128,
  maxPerTransaction: positiveUint128,
  validAfter: z.number().int().positive(),
  validUntil: z.number().int().positive(),
  canDelegate: z.boolean().default(false),
  allowedTokens: z.array(evmAddress).min(1).max(32),
  allowedRecipients: z.array(evmAddress).max(32).default([]),
  allowedServices: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
    .max(32)
    .default([]),
  policyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).refine((value) => amountIsAtMost(value.maxPerTransaction, value.budget), {
  path: ["maxPerTransaction"],
  message: "Per-transaction limit cannot exceed the budget",
}).refine((value) => value.validUntil > value.validAfter, {
  path: ["validUntil"],
  message: "Expiry must be after the start time",
});

export const delegateCapabilitySchema = z.object({
  organizationId: z.string().min(1),
  childAgentId: z.string().min(1),
  childBudget: positiveUint128,
  childMaxPerTransaction: positiveUint128,
  childExpiry: z.number().int().positive(),
  allowedTokens: z.array(evmAddress).min(1).max(32),
  allowedRecipients: z.array(evmAddress).max(32).default([]),
  allowedServices: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
    .max(32)
    .default([]),
  policyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).refine((value) => amountIsAtMost(value.childMaxPerTransaction, value.childBudget), {
  path: ["childMaxPerTransaction"],
  message: "Per-transaction limit cannot exceed the child budget",
});

export const updateCapabilitySchema = z.object({
  organizationId: z.string().min(1),
  maxPerTransaction: positiveUint128,
  validUntil: z.number().int().positive(),
  policyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const confirmCapabilitySchema = z.object({
  draftId: z.string().min(1),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type LinkWalletInput = z.infer<typeof linkWalletSchema>;
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
