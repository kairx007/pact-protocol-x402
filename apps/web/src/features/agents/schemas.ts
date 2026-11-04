import { z } from "zod";

export const agentRecordSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  identity: z.object({
    standard: z.literal("ERC8004"),
    registryAddress: z.string(),
    agentId: z.string(),
    chainId: z.number().int(),
    registrationURI: z.string().optional(),
    verifiedAt: z.string().optional(),
    verifiedOwner: z.string().optional(),
    verifiedWallet: z.string().optional(),
  }),
  signer: z.object({ address: z.string(), type: z.enum(["EOA", "ERC1271"]) }),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const agentListSchema = z.array(agentRecordSchema);
export type AgentRecordDto = z.infer<typeof agentRecordSchema>;
