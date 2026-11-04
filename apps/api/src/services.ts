import { randomUUID } from "node:crypto";
import { getAddress, verifyMessage } from "viem";
import {
  createOrganizationSchema,
  DomainError,
  linkWalletSchema,
  registerAgentSchema,
  rotateAgentSignerSchema,
  type OrganizationRecord,
  type RegisteredAgentRecord,
} from "@pact/shared";
import { collections } from "./db.js";
import { verifyErc8004Identity } from "./identity.js";
import type { AuthContext } from "./auth.js";

function assertOrganizationOwner(
  auth: AuthContext,
  organizationId: string,
): void {
  if (
    auth.organizationId !== organizationId ||
    !["owner", "admin"].includes(auth.role)
  ) {
    throw new DomainError(
      "Organization owner authorization required",
      "FORBIDDEN",
      403,
    );
  }
}

export async function createOrganization(
  auth: AuthContext,
  body: unknown,
): Promise<OrganizationRecord> {
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid organization details",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  const { organizations } = await collections();
  const now = new Date().toISOString();
  const record: OrganizationRecord = {
    id: randomUUID(),
    organizationId: randomUUID(),
    ownerUserId: auth.userId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await organizations.insertOne(record);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new DomainError(
        "Organization slug is already in use",
        "ORGANIZATION_SLUG_CONFLICT",
        409,
      );
    }
    throw error;
  }
  return record;
}

export async function getOrganization(
  auth: AuthContext,
  organizationId: string,
): Promise<OrganizationRecord> {
  assertOrganizationOwner(auth, organizationId);
  const { organizations } = await collections();
  const record = await organizations.findOne({ organizationId });
  if (!record)
    throw new DomainError("Organization not found", "ORG_NOT_FOUND", 404);
  return record;
}

export async function linkOrganizationWallet(
  auth: AuthContext,
  organizationId: string,
  body: unknown,
): Promise<OrganizationRecord> {
  assertOrganizationOwner(auth, organizationId);
  const parsed = linkWalletSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid wallet proof",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  const { address, type, signature, message } = parsed.data;
  if (!message.includes(organizationId) || !message.includes(address)) {
    throw new DomainError(
      "Wallet proof must bind the organization and wallet address",
      "WALLET_PROOF_INVALID",
      422,
    );
  }
  const valid = await verifyMessage({
    address: getAddress(address),
    message,
    signature: signature as `0x${string}`,
  });
  if (!valid)
    throw new DomainError(
      "Wallet signature is invalid",
      "WALLET_PROOF_INVALID",
      422,
    );
  const { organizations } = await collections();
  const result = await organizations.findOneAndUpdate(
    { organizationId, ownerUserId: auth.userId },
    {
      $set: {
        wallet: { address: getAddress(address), type },
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result)
    throw new DomainError("Organization not found", "ORG_NOT_FOUND", 404);
  return result;
}

export async function registerAgent(
  auth: AuthContext,
  body: unknown,
): Promise<RegisteredAgentRecord> {
  const parsed = registerAgentSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid agent registration",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  assertOrganizationOwner(auth, parsed.data.organizationId);
  const { organizations, agents } = await collections();
  const organization = await organizations.findOne({
    organizationId: parsed.data.organizationId,
  });
  if (!organization)
    throw new DomainError("Organization not found", "ORG_NOT_FOUND", 404);
  const verified = await verifyErc8004Identity({
    chainId: parsed.data.chainId,
    registryAddress: parsed.data.registryAddress,
    agentId: parsed.data.agentId,
    signerAddress: parsed.data.signerAddress,
  });
  const now = new Date().toISOString();
  const record: RegisteredAgentRecord = {
    id: randomUUID(),
    agentId: randomUUID(),
    organizationId: parsed.data.organizationId,
    name: parsed.data.name,
    ...(parsed.data.description
      ? { description: parsed.data.description }
      : {}),
    identity: {
      standard: "ERC8004",
      registryAddress: getAddress(parsed.data.registryAddress),
      agentId: parsed.data.agentId,
      chainId: parsed.data.chainId,
      registrationURI: verified.registrationURI,
      verifiedAt: now,
      verifiedOwner: verified.owner,
      verifiedWallet: verified.wallet,
    },
    signer: { address: getAddress(parsed.data.signerAddress), type: "EOA" },
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await agents.insertOne(record);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new DomainError(
        "ERC-8004 identity is already registered in this organization",
        "AGENT_IDENTITY_CONFLICT",
        409,
      );
    }
    throw error;
  }
  return record;
}

export async function listAgents(
  auth: AuthContext,
  organizationId?: string,
): Promise<RegisteredAgentRecord[]> {
  if (
    !auth.organizationId ||
    (organizationId && organizationId !== auth.organizationId)
  ) {
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  }
  const { agents } = await collections();
  return agents.find({ organizationId: auth.organizationId }).toArray();
}

export async function getAgent(
  auth: AuthContext,
  agentId: string,
): Promise<RegisteredAgentRecord> {
  if (!auth.organizationId)
    throw new DomainError("Organization access denied", "FORBIDDEN", 403);
  const { agents } = await collections();
  const record = await agents.findOne({
    agentId,
    organizationId: auth.organizationId,
  });
  if (!record) throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  return record;
}

export async function verifyAgentIdentity(
  auth: AuthContext,
  agentId: string,
  organizationId: string,
): Promise<RegisteredAgentRecord> {
  assertOrganizationOwner(auth, organizationId);
  const { agents } = await collections();
  const record = await agents.findOne({ agentId, organizationId });
  if (!record) throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  const verified = await verifyErc8004Identity({
    chainId: record.identity.chainId,
    registryAddress: record.identity.registryAddress,
    agentId: record.identity.agentId,
    signerAddress: record.signer.address,
  });
  const now = new Date().toISOString();
  const updated = await agents.findOneAndUpdate(
    { agentId, organizationId },
    {
      $set: {
        "identity.registrationURI": verified.registrationURI,
        "identity.verifiedOwner": verified.owner,
        "identity.verifiedWallet": verified.wallet,
        "identity.verifiedAt": now,
        status: "ACTIVE",
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated)
    throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  return updated;
}

export async function revokeAgent(
  auth: AuthContext,
  agentId: string,
  organizationId: string,
): Promise<RegisteredAgentRecord> {
  assertOrganizationOwner(auth, organizationId);
  const { agents } = await collections();
  const result = await agents.findOneAndUpdate(
    { agentId, organizationId },
    { $set: { status: "REVOKED", updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );
  if (!result) throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  return result;
}

export async function rotateAgentSigner(
  auth: AuthContext,
  agentId: string,
  body: unknown,
): Promise<RegisteredAgentRecord> {
  const parsed = rotateAgentSignerSchema.safeParse(body);
  if (!parsed.success)
    throw new DomainError(
      "Invalid signer rotation proof",
      "VALIDATION_ERROR",
      400,
      parsed.error.flatten(),
    );
  assertOrganizationOwner(auth, parsed.data.organizationId);
  const { agents } = await collections();
  const current = await agents.findOne({
    agentId,
    organizationId: parsed.data.organizationId,
  });
  if (!current)
    throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  const signer = getAddress(parsed.data.signerAddress);
  if (
    !parsed.data.message.includes(agentId) ||
    !parsed.data.message.includes(signer)
  ) {
    throw new DomainError(
      "Signer proof must bind the agent and new signer",
      "SIGNER_PROOF_INVALID",
      422,
    );
  }
  if (
    !(await verifyMessage({
      address: signer,
      message: parsed.data.message,
      signature: parsed.data.proof as `0x${string}`,
    }))
  ) {
    throw new DomainError(
      "New signer proof is invalid",
      "SIGNER_PROOF_INVALID",
      422,
    );
  }
  // Update off-chain state only after matching the new signer to ERC-8004's current wallet.
  const verified = await verifyErc8004Identity({
    chainId: current.identity.chainId,
    registryAddress: current.identity.registryAddress,
    agentId: current.identity.agentId,
    signerAddress: signer,
  });
  const now = new Date().toISOString();
  const updated = await agents.findOneAndUpdate(
    { agentId, organizationId: parsed.data.organizationId },
    {
      $set: {
        signer: { address: signer, type: "EOA" },
        "identity.verifiedOwner": verified.owner,
        "identity.verifiedWallet": verified.wallet,
        "identity.registrationURI": verified.registrationURI,
        "identity.verifiedAt": now,
        status: "ACTIVE",
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!updated)
    throw new DomainError("Agent not found", "AGENT_NOT_FOUND", 404);
  return updated;
}
