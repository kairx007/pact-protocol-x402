import { z } from "zod";

export const organizationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  ownerUserId: z.string(),
  wallet: z
    .object({
      address: z.string(),
      type: z.enum(["MERA", "EOA", "SMART_ACCOUNT"]),
    })
    .optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const treasurySchema = z.object({
  id: z.string(),
  treasuryId: z.string(),
  organizationId: z.string(),
  chainId: z.number().int(),
  contractAddress: z.string(),
  ownerAddress: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  tokenDecimals: z.number().int(),
  status: z.enum(["PENDING", "ACTIVE", "PAUSED"]),
  cachedBalance: z.string(),
  lastSyncedBlock: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const treasuryBalanceSchema = z.object({
  balance: z.string(),
  availableBalance: z.string(),
  reserved: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  tokenDecimals: z.number().int(),
  blockNumber: z.number().int(),
});

export const treasuryTransactionSchema = z.object({
  id: z.string(),
  treasuryId: z.string(),
  organizationId: z.string(),
  chainId: z.number().int(),
  transactionHash: z.string(),
  blockNumber: z.number().int(),
  logIndex: z.number().int(),
  type: z.enum([
    "TREASURY_CREATED",
    "DEPOSIT",
    "WITHDRAWAL",
    "PAUSE",
    "UNPAUSE",
    "RESERVATION",
    "SETTLEMENT",
    "RELEASE",
  ]),
  amount: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  createdAt: z.string(),
});

export const treasuryTransactionsSchema = z.array(treasuryTransactionSchema);
export type OrganizationDto = z.infer<typeof organizationSchema>;
export type TreasuryDto = z.infer<typeof treasurySchema>;
export type TreasuryBalanceDto = z.infer<typeof treasuryBalanceSchema>;
export type TreasuryTransactionDto = z.infer<typeof treasuryTransactionSchema>;
