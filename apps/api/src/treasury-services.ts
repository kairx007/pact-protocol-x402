import { randomUUID } from "node:crypto";
import { encodePacked, getAddress, keccak256, type Address } from "viem";
import {
  createTreasurySchema,
  confirmTreasuryTransactionSchema,
  depositIntentSchema,
  DomainError,
  withdrawTreasurySchema,
  type TreasuryRecord,
  type TreasuryTransactionRecord,
} from "@pact/shared";
import type { AuthContext } from "./auth.js";
import { collections } from "./db.js";
import { approvedTokens } from "./config.js";
import {
  approvedTokenFor,
  confirmedTransaction,
  confirmedTreasuryCreation,
  deployTreasury,
  erc20Balance,
  getTreasuryChainState,
  ownerTransaction,
  prepareDeposit,
  tokenInfo,
  transactionHistory,
} from "./treasury-chain.js";

function assertOwner(auth: AuthContext, organizationId: string): void {
  if (auth.organizationId !== organizationId || auth.role !== "owner") {
    throw new DomainError(
      "Organization owner authorization required",
      "FORBIDDEN",
      403,
    );
  }
}

function organizationKey(organizationId: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [organizationId]));
}

async function ownedTreasury(
  auth: AuthContext,
  treasuryId: string,
): Promise<TreasuryRecord> {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { treasuries } = await collections();
  const record = await treasuries.findOne({
    treasuryId,
    organizationId: auth.organizationId,
  });
  if (!record)
    throw new DomainError("Treasury not found", "TREASURY_NOT_FOUND", 404);
  if (record.status === "PENDING")
    throw new DomainError(
      "Treasury deployment has not been confirmed",
      "TREASURY_NOT_DEPLOYED",
      409,
    );
  return record;
}

export async function createTreasury(
  auth: AuthContext,
  body: unknown,
): Promise<TreasuryRecord> {
  const parsed = createTreasurySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid treasury configuration",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  assertOwner(auth, parsed.data.organizationId);
  const { organizations, treasuries } = await collections();
  const organization = await organizations.findOne({
    organizationId: parsed.data.organizationId,
    ownerUserId: auth.userId,
  });
  if (!organization)
    throw new DomainError("Organization not found", "ORG_NOT_FOUND", 404);
  if (!organization.wallet)
    throw new DomainError(
      "Link and verify an organization wallet before treasury creation",
      "ORGANIZATION_WALLET_REQUIRED",
      409,
    );
  const token = approvedTokenFor(parsed.data.chainId, parsed.data.tokenAddress);
  const configuredTokens = Object.keys(
    approvedTokens[String(parsed.data.chainId)] ?? {},
  );
  if (
    configuredTokens.length !== 1 ||
    getAddress(configuredTokens[0]!) !== getAddress(parsed.data.tokenAddress)
  ) {
    throw new DomainError(
      "The factory supports exactly one configured token per environment",
      "UNSUPPORTED_TOKEN",
      400,
    );
  }
  const actualToken = await tokenInfo(
    parsed.data.chainId,
    getAddress(parsed.data.tokenAddress),
  );
  if (
    token.symbol !== actualToken.symbol ||
    token.decimals !== actualToken.decimals
  )
    throw new DomainError(
      "Approved token metadata mismatch",
      "UNSUPPORTED_TOKEN",
      400,
    );
  const placeholder: TreasuryRecord = {
    id: randomUUID(),
    treasuryId: randomUUID(),
    organizationId: parsed.data.organizationId,
    chainId: parsed.data.chainId,
    contractAddress: "0x0000000000000000000000000000000000000000",
    ownerAddress: organization.wallet.address,
    tokenAddress: getAddress(parsed.data.tokenAddress),
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    status: "PENDING",
    cachedBalance: "0",
    lastSyncedBlock: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Reserve the org/chain pair before submitting the deploy tx to prevent concurrent duplicates.
  await treasuries.insertOne(placeholder);
  try {
    const deployed = await deployTreasury({
      chainId: parsed.data.chainId,
      organizationKey: organizationKey(parsed.data.organizationId),
      owner: getAddress(organization.wallet.address) as Address,
    });
    const record: TreasuryRecord = {
      ...placeholder,
      contractAddress: deployed.factory,
      tokenAddress: deployed.tokenAddress,
      tokenSymbol: deployed.token.symbol,
      tokenDecimals: deployed.token.decimals,
      updatedAt: new Date().toISOString(),
    };
    await treasuries.updateOne(
      { treasuryId: placeholder.treasuryId },
      { $set: record },
    );
    return Object.assign(record, {
      deployment: { to: deployed.factory, data: deployed.transactionData },
    });
  } catch (error) {
    await treasuries.deleteOne({
      treasuryId: placeholder.treasuryId,
      contractAddress: placeholder.contractAddress,
    });
    throw error;
  }
}

export async function confirmTreasuryCreation(
  auth: AuthContext,
  treasuryId: string,
  body: unknown,
) {
  const record = await ownedTreasury(auth, treasuryId);
  assertOwner(auth, record.organizationId);
  const parsed = confirmTreasuryTransactionSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid transaction hash",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  if (record.status !== "PENDING")
    throw new DomainError(
      "Treasury is not awaiting deployment confirmation",
      "INVALID_TREASURY_STATE",
      409,
    );
  const organizationKey = keccak256(
    encodePacked(["string"], [record.organizationId]),
  );
  const deployment = await confirmedTreasuryCreation({
    chainId: record.chainId,
    factory: getAddress(record.contractAddress),
    hash: parsed.data.transactionHash as `0x${string}`,
    organizationKey,
    owner: getAddress(record.ownerAddress),
    token: getAddress(record.tokenAddress),
  });
  const { treasuries, treasuryTransactions } = await collections();
  const updated: TreasuryRecord = {
    ...record,
    contractAddress: deployment.address,
    status: "ACTIVE",
    lastSyncedBlock: Number(deployment.blockNumber),
    updatedAt: new Date().toISOString(),
  };
  await treasuries.updateOne(
    { treasuryId, status: "PENDING" },
    { $set: updated },
  );
  await treasuryTransactions.updateOne(
    {
      chainId: record.chainId,
      transactionHash: parsed.data.transactionHash,
      logIndex: deployment.logIndex,
    },
    {
      $setOnInsert: {
        id: randomUUID(),
        treasuryId,
        organizationId: record.organizationId,
        chainId: record.chainId,
        transactionHash: parsed.data.transactionHash,
        blockNumber: Number(deployment.blockNumber),
        logIndex: deployment.logIndex,
        type: "TREASURY_CREATED",
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  return updated;
}

export async function getTreasury(
  auth: AuthContext,
  treasuryId: string,
): Promise<TreasuryRecord> {
  const record = await ownedTreasury(auth, treasuryId);
  const state = await getTreasuryChainState({
    chainId: record.chainId,
    address: getAddress(record.contractAddress),
  });
  const { treasuries } = await collections();
  const updated: TreasuryRecord = {
    ...record,
    ownerAddress: state.owner,
    status: state.paused ? "PAUSED" : "ACTIVE",
    cachedBalance: state.balance.toString(),
    lastSyncedBlock: Number(state.blockNumber),
    updatedAt: new Date().toISOString(),
  };
  await treasuries.updateOne({ treasuryId }, { $set: updated });
  return updated;
}

export async function treasuryBalance(auth: AuthContext, treasuryId: string) {
  const record = await ownedTreasury(auth, treasuryId);
  const state = await getTreasuryChainState({
    chainId: record.chainId,
    address: getAddress(record.contractAddress),
  });
  return {
    balance: state.balance.toString(),
    availableBalance: state.availableBalance.toString(),
    reserved: state.reserved.toString(),
    tokenAddress: state.tokenAddress,
    tokenSymbol: record.tokenSymbol,
    tokenDecimals: record.tokenDecimals,
    blockNumber: Number(state.blockNumber),
  };
}

export async function depositIntent(
  auth: AuthContext,
  treasuryId: string,
  body: unknown,
) {
  const record = await ownedTreasury(auth, treasuryId);
  const parsed = depositIntentSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid deposit amount",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  const { organizations } = await collections();
  const organization = await organizations.findOne({
    organizationId: record.organizationId,
    ownerUserId: auth.userId,
  });
  if (!organization?.wallet)
    throw new DomainError(
      "Verified organization wallet required",
      "ORGANIZATION_WALLET_REQUIRED",
      409,
    );
  const intent = await prepareDeposit({
    chainId: record.chainId,
    treasuryAddress: getAddress(record.contractAddress),
    ownerAddress: getAddress(organization.wallet.address),
    amount: BigInt(parsed.data.amount),
  });
  return {
    chainId: record.chainId,
    from: organization.wallet.address,
    tokenAddress: intent.tokenAddress,
    spender: intent.spender,
    amount: parsed.data.amount,
    currentAllowance: intent.currentAllowance.toString(),
    approvalRequired: intent.currentAllowance < BigInt(parsed.data.amount),
    approveTransaction: intent.approveData,
    depositTransaction: intent.depositData,
    note: "Submit approval (if needed) and deposit from the company wallet; PACT does not custody deposit funds.",
  };
}

export async function withdrawTreasury(
  auth: AuthContext,
  treasuryId: string,
  body: unknown,
) {
  const record = await ownedTreasury(auth, treasuryId);
  assertOwner(auth, record.organizationId);
  const parsed = withdrawTreasurySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid withdrawal authorization",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  if (parsed.data.deadline <= Math.floor(Date.now() / 1000))
    throw new DomainError(
      "Withdrawal authorization has expired",
      "SIGNATURE_EXPIRED",
      422,
    );
  const { organizations } = await collections();
  const organization = await organizations.findOne({
    organizationId: record.organizationId,
    ownerUserId: auth.userId,
  });
  if (!organization?.wallet)
    throw new DomainError(
      "Verified organization wallet required",
      "ORGANIZATION_WALLET_REQUIRED",
      409,
    );
  return {
    chainId: record.chainId,
    from: organization.wallet.address,
    to: record.contractAddress,
    data: ownerTransaction({
      action: "withdraw",
      args: [
        BigInt(parsed.data.amount),
        getAddress(parsed.data.recipient),
        BigInt(parsed.data.nonce),
        BigInt(parsed.data.deadline),
        parsed.data.signature as `0x${string}`,
      ],
    }),
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function pauseTreasury(auth: AuthContext, treasuryId: string) {
  const record = await ownedTreasury(auth, treasuryId);
  assertOwner(auth, record.organizationId);
  return {
    chainId: record.chainId,
    from: record.ownerAddress,
    to: record.contractAddress,
    data: ownerTransaction({ action: "pause" }),
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function unpauseTreasury(auth: AuthContext, treasuryId: string) {
  const record = await ownedTreasury(auth, treasuryId);
  assertOwner(auth, record.organizationId);
  return {
    chainId: record.chainId,
    from: record.ownerAddress,
    to: record.contractAddress,
    data: ownerTransaction({ action: "unpause" }),
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function syncTreasuryTransactions(record: TreasuryRecord) {
  const { treasuries, treasuryTransactions } = await collections();
  const logs = await transactionHistory({
    chainId: record.chainId,
    address: getAddress(record.contractAddress),
    fromBlock: BigInt(record.lastSyncedBlock),
  });
  const events: TreasuryTransactionRecord[] = logs.map((log) => {
    const eventName = log.eventName;
    const type = (
      {
        Deposited: "DEPOSIT",
        Withdrawn: "WITHDRAWAL",
        TreasuryPaused: "PAUSE",
        TreasuryUnpaused: "UNPAUSE",
        FundsReserved: "RESERVATION",
        PaymentSettled: "SETTLEMENT",
        ReservationReleased: "RELEASE",
      } as const
    )[eventName as "Deposited"];
    const amount = "amount" in log.args ? String(log.args.amount) : undefined;
    const from = "sender" in log.args ? String(log.args.sender) : undefined;
    const to = "recipient" in log.args ? String(log.args.recipient) : undefined;
    return {
      id: randomUUID(),
      treasuryId: record.treasuryId,
      organizationId: record.organizationId,
      chainId: record.chainId,
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      type: type ?? "DEPOSIT",
      ...(amount ? { amount } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      createdAt: new Date().toISOString(),
    };
  });
  if (events.length) {
    await treasuryTransactions.bulkWrite(
      events.map((event) => ({
        updateOne: {
          filter: {
            chainId: event.chainId,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
          },
          update: { $setOnInsert: event },
          upsert: true,
        },
      })),
    );
  }
  const state = await getTreasuryChainState({
    chainId: record.chainId,
    address: getAddress(record.contractAddress),
  });
  await treasuries.updateOne(
    { treasuryId: record.treasuryId },
    {
      $set: {
        cachedBalance: state.balance.toString(),
        status: state.paused ? "PAUSED" : "ACTIVE",
        lastSyncedBlock: Number(state.blockNumber),
        updatedAt: new Date().toISOString(),
      },
    },
  );
  return events;
}

export async function treasuryTransactionsPage(
  auth: AuthContext,
  treasuryId: string,
) {
  const record = await ownedTreasury(auth, treasuryId);
  await syncTreasuryTransactions(record);
  const { treasuryTransactions } = await collections();
  return treasuryTransactions
    .find({ treasuryId })
    .sort({ blockNumber: -1, logIndex: -1 })
    .limit(100)
    .toArray();
}

export async function confirmTreasuryTransaction(
  auth: AuthContext,
  treasuryId: string,
  body: unknown,
) {
  const record = await ownedTreasury(auth, treasuryId);
  const parsed = confirmTreasuryTransactionSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid transaction hash",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  const receipt = await confirmedTransaction(
    record.chainId,
    parsed.data.transactionHash as `0x${string}`,
  );
  if (receipt.status !== "success")
    throw new DomainError(
      "Treasury transaction reverted",
      "CHAIN_TRANSACTION_FAILED",
      422,
    );
  const events = await syncTreasuryTransactions(record);
  return {
    transactionHash: parsed.data.transactionHash,
    blockNumber: Number(receipt.blockNumber),
    indexedEvents: events.length,
    status: "CONFIRMED" as const,
  };
}

export async function verifiedToken(chainId: number, tokenAddress: string) {
  try {
    return {
      ...approvedTokenFor(chainId, tokenAddress),
      ...(await tokenInfo(chainId, getAddress(tokenAddress))),
    };
  } catch (error) {
    throw new DomainError(
      error instanceof Error ? error.message : "Unsupported token",
      "UNSUPPORTED_TOKEN",
      400,
    );
  }
}

export async function directTokenBalance(
  chainId: number,
  tokenAddress: string,
  treasuryAddress: string,
) {
  return (
    await erc20Balance(
      chainId,
      getAddress(tokenAddress),
      getAddress(treasuryAddress),
    )
  ).toString();
}
