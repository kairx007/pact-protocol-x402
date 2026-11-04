export type Environment = "local" | "devnet" | "testnet" | "mainnet";

export type PaymentStatus =
  | "CREATED"
  | "EVALUATING"
  | "REVIEW_REQUIRED"
  | "RESERVED"
  | "SETTLEMENT_PENDING"
  | "SETTLED"
  | "RELEASE_PENDING"
  | "RELEASED"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED";

export type GuardrailDecision = "ALLOW" | "DENY" | "REVIEW";
export type AgentStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

/** Decimal token amount at API boundaries. Never represent money with JS number. */
export interface TokenAmount {
  amount: string;
  tokenDecimals: number;
}

/** Core entities are intentionally distinct; identity does not grant authority. */
export interface Organization {
  id: string;
  ownerId: string;
  treasuryId: string;
  name: string;
  createdAt: string;
}
export interface Owner {
  id: string;
  walletAddress: string;
}
export interface Treasury {
  id: string;
  organizationId: string;
  chainId: number;
  contractAddress: string;
}
export interface Agent {
  id: string;
  organizationId: string;
  identityId?: string;
  status: AgentStatus;
  createdAt: string;
}
export interface AgentIdentity {
  id: string;
  agentId: string;
  registryAddress: string;
  tokenId: string;
  verifiedAt?: string;
}
export interface Capability {
  id: string;
  agentId: string;
  treasuryId: string;
  tokenAddress: string;
  budget: TokenAmount;
  maxPayment: TokenAmount;
  expiresAt: string;
  revokedAt?: string;
}
export interface Policy {
  id: string;
  organizationId: string;
  rules: Record<string, unknown>;
}
export interface PaymentIntent {
  id: string;
  agentId: string;
  capabilityId: string;
  recipient: string;
  tokenAddress: string;
  amount: TokenAmount;
  nonce: string;
  signature: string;
  expiresAt: string;
}
export interface Reservation {
  id: string;
  paymentIntentId: string;
  amount: TokenAmount;
  expiresAt: string;
}
export interface Payment {
  id: string;
  paymentIntentId: string;
  status: PaymentStatus;
  transactionHash?: string;
  createdAt: string;
}
export interface Approval {
  id: string;
  paymentIntentId: string;
  ownerId: string;
  approvedAt: string;
  signature?: string;
}
