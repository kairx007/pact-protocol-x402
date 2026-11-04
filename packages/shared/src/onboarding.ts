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

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type LinkWalletInput = z.infer<typeof linkWalletSchema>;
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;
