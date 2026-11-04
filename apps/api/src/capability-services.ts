import { randomUUID } from "node:crypto";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import {
  createCapabilitySchema,
  confirmCapabilitySchema,
  delegateCapabilitySchema,
  DomainError,
  updateCapabilitySchema,
  type CapabilityRecord,
} from "@pact/shared";
import type { AuthContext } from "./auth.js";
import { collections } from "./db.js";
import { capabilityContracts } from "./config.js";
import {
  capabilityTransaction,
  confirmCapabilityCreation,
  readCapability,
  readCapabilityChildren,
} from "./treasury-chain.js";

const zero = "0x0000000000000000000000000000000000000000";

function ownerOnly(auth: AuthContext, organizationId: string) {
  if (auth.organizationId !== organizationId || auth.role !== "owner")
    throw new DomainError(
      "Organization owner authorization required",
      "FORBIDDEN",
      403,
    );
}

function agentKey(agent: {
  organizationId: string;
  identity: { registryAddress: string; agentId: string; chainId: number };
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(new TextEncoder().encode(agent.organizationId)),
        getAddress(agent.identity.registryAddress),
        BigInt(agent.identity.agentId),
        BigInt(agent.identity.chainId),
      ],
    ),
  );
}

async function findTreasury(auth: AuthContext, treasuryId: string) {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { treasuries } = await collections();
  const treasury = await treasuries.findOne({
    treasuryId,
    organizationId: auth.organizationId,
    status: "ACTIVE",
  });
  if (!treasury)
    throw new DomainError(
      "Active treasury not found",
      "TREASURY_NOT_FOUND",
      404,
    );
  return treasury;
}

export async function createCapability(auth: AuthContext, body: unknown) {
  const parsed = createCapabilitySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid capability",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  ownerOnly(auth, parsed.data.organizationId);
  const { organizations, agents } = await collections();
  const organization = await organizations.findOne({
    organizationId: parsed.data.organizationId,
    ownerUserId: auth.userId,
  });
  if (!organization)
    throw new DomainError("Organization not found", "ORG_NOT_FOUND", 404);
  if (!organization.wallet?.address)
    throw new DomainError(
      "Link an organization wallet before creating capabilities",
      "ORGANIZATION_WALLET_REQUIRED",
      409,
    );
  const treasury = await findTreasury(auth, parsed.data.treasuryId);
  const agent = await agents.findOne({
    agentId: parsed.data.agentId,
    organizationId: parsed.data.organizationId,
    status: "ACTIVE",
  });
  if (!agent)
    throw new DomainError(
      "Verified active agent not found",
      "AGENT_NOT_FOUND",
      404,
    );
  if (agent.identity.chainId !== treasury.chainId)
    throw new DomainError(
      "Agent identity and treasury must use the same chain",
      "CHAIN_MISMATCH",
      400,
    );
  if (
    !parsed.data.allowedTokens.some(
      (token) => getAddress(token) === getAddress(treasury.tokenAddress),
    )
  )
    throw new DomainError(
      "Capability token allowlist must include the treasury token",
      "TOKEN_NOT_ALLOWED",
      400,
    );
  const contract = capabilityContracts[String(treasury.chainId)];
  if (!contract)
    throw new DomainError(
      "Capability contract is not configured",
      "CAPABILITY_CONTRACT_NOT_CONFIGURED",
      503,
    );
  const data = capabilityTransaction(treasury.chainId, "createCapability", [
    keccak256(new TextEncoder().encode(parsed.data.organizationId)),
    getAddress(treasury.contractAddress),
    agentKey(agent),
    BigInt(parsed.data.budget),
    BigInt(parsed.data.maxPerTransaction),
    BigInt(parsed.data.validAfter),
    BigInt(parsed.data.validUntil),
    parsed.data.canDelegate,
    parsed.data.allowedTokens.map(getAddress),
    parsed.data.allowedRecipients.map(getAddress),
    parsed.data.allowedServices as `0x${string}`[],
    parsed.data.policyHash as `0x${string}`,
  ]);
  const draftId = `pending:${randomUUID()}`;
  const now = new Date().toISOString();
  const { capabilities } = await collections();
  await capabilities.insertOne({
    id: randomUUID(),
    capabilityId: draftId,
    organizationId: parsed.data.organizationId,
    treasuryId: treasury.treasuryId,
    agentId: agent.agentId,
    agentKey: agentKey(agent),
    budget: parsed.data.budget,
    maxPerTransaction: parsed.data.maxPerTransaction,
    policyHash: parsed.data.policyHash,
    allowedTokens: parsed.data.allowedTokens.map(getAddress),
    allowedRecipients: parsed.data.allowedRecipients.map(getAddress),
    allowedServices: parsed.data.allowedServices,
    validAfter: new Date(parsed.data.validAfter * 1000).toISOString(),
    validUntil: new Date(parsed.data.validUntil * 1000).toISOString(),
    canDelegate: parsed.data.canDelegate,
    depth: 0,
    status: "PENDING",
    chainId: treasury.chainId,
    contractAddress: data.address,
    createdAt: now,
    updatedAt: now,
  });
  return {
    capabilityDraftId: draftId,
    chainId: treasury.chainId,
    from: organization.wallet.address,
    to: data.address,
    data: data.data,
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function listAgentCapabilities(
  auth: AuthContext,
  agentId: string,
) {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { capabilities } = await collections();
  return capabilities
    .find({ organizationId: auth.organizationId, agentId })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getCapability(auth: AuthContext, capabilityId: string) {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { capabilities } = await collections();
  const record = await capabilities.findOne({
    capabilityId,
    organizationId: auth.organizationId,
  });
  if (!record)
    throw new DomainError("Capability not found", "CAPABILITY_NOT_FOUND", 404);
  if (record.status === "PENDING")
    throw new DomainError(
      "Capability creation has not been confirmed on-chain",
      "CAPABILITY_PENDING",
      409,
    );
  const state = await readCapability(
    record.chainId,
    capabilityId as `0x${string}`,
  );
  return {
    ...record,
    onChain: state.capability,
    onChainActive: state.active,
    availableBudget: state.available.toString(),
  };
}

export async function delegateCapability(
  auth: AuthContext,
  capabilityId: string,
  body: unknown,
) {
  const parsed = delegateCapabilitySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid delegated capability",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  ownerOnly(auth, parsed.data.organizationId);
  const { capabilities, agents } = await collections();
  const parent = await capabilities.findOne({
    capabilityId,
    organizationId: parsed.data.organizationId,
    status: "ACTIVE",
  });
  if (!parent)
    throw new DomainError(
      "Active parent capability not found",
      "CAPABILITY_NOT_FOUND",
      404,
    );
  const child = await agents.findOne({
    agentId: parsed.data.childAgentId,
    organizationId: parsed.data.organizationId,
    status: "ACTIVE",
  });
  if (!child)
    throw new DomainError(
      "Verified active child agent not found",
      "AGENT_NOT_FOUND",
      404,
    );
  if (child.identity.chainId !== parent.chainId)
    throw new DomainError(
      "Parent and child agents must use the capability chain",
      "CHAIN_MISMATCH",
      400,
    );
  const parentAgent = await agents.findOne({
    agentId: parent.agentId,
    organizationId: parsed.data.organizationId,
    status: "ACTIVE",
  });
  if (!parentAgent)
    throw new DomainError(
      "Parent capability agent is not active",
      "AGENT_NOT_FOUND",
      409,
    );
  const parentState = await readCapability(
    parent.chainId,
    capabilityId as `0x${string}`,
  );
  if (
    !parentState.active ||
    !parentState.capability.canDelegate ||
    BigInt(parsed.data.childMaxPerTransaction) >
      BigInt(parentState.capability.maxPerTransaction) ||
    BigInt(parsed.data.childExpiry) > BigInt(parentState.capability.validUntil) ||
    BigInt(parsed.data.childBudget) > parentState.available
  )
    throw new DomainError(
      "Delegation exceeds current parent authority",
      "INSUFFICIENT_CAPABILITY_BUDGET",
      409,
    );
  const data = capabilityTransaction(parent.chainId, "delegateCapability", [
    capabilityId,
    agentKey(child),
    child.signer.address,
    BigInt(parsed.data.childBudget),
    BigInt(parsed.data.childMaxPerTransaction),
    BigInt(parsed.data.childExpiry),
    parsed.data.allowedTokens.map(getAddress),
    parsed.data.allowedRecipients.map(getAddress),
    parsed.data.allowedServices as `0x${string}`[],
    parsed.data.policyHash as `0x${string}`,
  ]);
  const draftId = `pending:${randomUUID()}`;
  const now = new Date().toISOString();
  await capabilities.insertOne({
    id: randomUUID(),
    capabilityId: draftId,
    organizationId: parsed.data.organizationId,
    treasuryId: parent.treasuryId,
    agentId: child.agentId,
    agentKey: agentKey(child),
    parentCapabilityId: parent.capabilityId,
    budget: parsed.data.childBudget,
    maxPerTransaction: parsed.data.childMaxPerTransaction,
    policyHash: parsed.data.policyHash,
    allowedTokens: parsed.data.allowedTokens.map(getAddress),
    allowedRecipients: parsed.data.allowedRecipients.map(getAddress),
    allowedServices: parsed.data.allowedServices,
    validAfter: new Date(
      Number(parentState.capability.validAfter) * 1000,
    ).toISOString(),
    validUntil: new Date(parsed.data.childExpiry * 1000).toISOString(),
    canDelegate: Boolean(parentState.capability.canDelegate),
    depth: Number(parentState.capability.depth) + 1,
    status: "PENDING",
    chainId: parent.chainId,
    contractAddress: data.address,
    createdAt: now,
    updatedAt: now,
  });
  return {
    capabilityDraftId: draftId,
    chainId: parent.chainId,
    from: parentAgent.signer.address,
    to: data.address,
    data: data.data,
    status: "READY_FOR_PARENT_AGENT_SIGNATURE" as const,
  };
}

export async function updateCapability(
  auth: AuthContext,
  capabilityId: string,
  body: unknown,
) {
  const parsed = updateCapabilitySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid capability update",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  ownerOnly(auth, parsed.data.organizationId);
  const { capabilities } = await collections();
  const capability = await capabilities.findOne({
    capabilityId,
    organizationId: parsed.data.organizationId,
    status: "ACTIVE",
  });
  if (!capability)
    throw new DomainError(
      "Active capability not found",
      "CAPABILITY_NOT_FOUND",
      404,
    );
  const data = capabilityTransaction(capability.chainId, "updateCapability", [
    capabilityId,
    BigInt(parsed.data.maxPerTransaction),
    BigInt(parsed.data.validUntil),
    parsed.data.policyHash as `0x${string}`,
  ]);
  return {
    chainId: capability.chainId,
    to: data.address,
    data: data.data,
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function revokeCapability(
  auth: AuthContext,
  capabilityId: string,
  organizationId: string,
) {
  ownerOnly(auth, organizationId);
  const { capabilities } = await collections();
  const capability = await capabilities.findOne({
    capabilityId,
    organizationId,
    status: "ACTIVE",
  });
  if (!capability)
    throw new DomainError(
      "Active capability not found",
      "CAPABILITY_NOT_FOUND",
      404,
    );
  const data = capabilityTransaction(capability.chainId, "revokeCapability", [
    capabilityId,
  ]);
  return {
    chainId: capability.chainId,
    to: data.address,
    data: data.data,
    status: "READY_FOR_OWNER_SIGNATURE" as const,
  };
}

export async function capabilityBudget(
  auth: AuthContext,
  capabilityId: string,
) {
  const result = await getCapability(auth, capabilityId);
  return {
    capabilityId,
    budget: result.budget,
    available: result.availableBudget,
    onChain: result.onChain,
  };
}

export async function capabilityChildren(
  auth: AuthContext,
  capabilityId: string,
) {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { capabilities } = await collections();
  const parent = await capabilities.findOne({
    capabilityId,
    organizationId: auth.organizationId,
  });
  if (!parent)
    throw new DomainError("Capability not found", "CAPABILITY_NOT_FOUND", 404);
  const childIds = await readCapabilityChildren(
    parent.chainId,
    capabilityId as `0x${string}`,
  );
  return capabilities
    .find({
      organizationId: auth.organizationId,
      capabilityId: { $in: childIds },
    })
    .toArray();
}

export async function confirmCapability(auth: AuthContext, body: unknown) {
  const parsed = confirmCapabilitySchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid capability confirmation",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  const { draftId, transactionHash } = parsed.data;
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { capabilities } = await collections();
  const draft = await capabilities.findOne({
    capabilityId: draftId,
    organizationId: auth.organizationId,
    status: "PENDING",
  });
  if (!draft)
    throw new DomainError(
      "Pending capability draft not found",
      "CAPABILITY_DRAFT_NOT_FOUND",
      404,
    );
  ownerOnly(auth, draft.organizationId);
  const result = await confirmCapabilityCreation({
    chainId: draft.chainId,
    hash: transactionHash as `0x${string}`,
    expectedOrg: keccak256(new TextEncoder().encode(draft.organizationId)),
    expectedAgentKey: draft.agentKey as `0x${string}`,
    expectedParent: draft.parentCapabilityId
      ? (draft.parentCapabilityId as `0x${string}`)
      : (`0x${"00".repeat(32)}` as `0x${string}`),
    expectedTreasury: getAddress(
      (await findTreasury(auth, draft.treasuryId)).contractAddress,
    ),
    expectedBudget: BigInt(draft.budget),
    expectedPolicyHash: draft.policyHash as `0x${string}`,
  });
  const updated = await capabilities.findOneAndUpdate(
    { capabilityId: draftId, status: "PENDING" },
    {
      $set: {
        capabilityId: result.capabilityId,
        status: "ACTIVE",
        transactionHash,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );
  if (!updated)
    throw new DomainError(
      "Capability draft changed during confirmation",
      "CAPABILITY_DRAFT_CONFLICT",
      409,
    );
  return updated;
}

export async function recordConfirmedCapability(input: {
  capabilityId: string;
  organizationId: string;
  treasuryId: string;
  agentId: string;
  agentKey: string;
  parentCapabilityId?: string;
  budget: string;
  maxPerTransaction: string;
  policyHash: string;
  allowedTokens: string[];
  allowedRecipients: string[];
  allowedServices: string[];
  validAfter: number;
  validUntil: number;
  canDelegate: boolean;
  depth: number;
  chainId: number;
  contractAddress: string;
  transactionHash: string;
}): Promise<CapabilityRecord> {
  const { capabilities } = await collections();
  const now = new Date().toISOString();
  const record: CapabilityRecord = {
    id: randomUUID(),
    capabilityId: input.capabilityId,
    organizationId: input.organizationId,
    treasuryId: input.treasuryId,
    agentId: input.agentId,
    agentKey: input.agentKey,
    ...(input.parentCapabilityId
      ? { parentCapabilityId: input.parentCapabilityId }
      : {}),
    budget: input.budget,
    maxPerTransaction: input.maxPerTransaction,
    policyHash: input.policyHash,
    allowedTokens: input.allowedTokens,
    allowedRecipients: input.allowedRecipients,
    allowedServices: input.allowedServices,
    validAfter: new Date(input.validAfter * 1000).toISOString(),
    validUntil: new Date(input.validUntil * 1000).toISOString(),
    canDelegate: input.canDelegate,
    depth: input.depth,
    status: "ACTIVE",
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    transactionHash: input.transactionHash,
    createdAt: now,
    updatedAt: now,
  };
  await capabilities.updateOne(
    { capabilityId: record.capabilityId },
    { $setOnInsert: record },
    { upsert: true },
  );
  return record;
}

export const ZERO_CAPABILITY = zero;
