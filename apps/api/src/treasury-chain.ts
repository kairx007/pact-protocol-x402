import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type PublicClient,
} from "viem";
import {
  approvedTokens,
  capabilityContracts,
  rpcUrls,
  treasuryFactoryAddresses,
  treasuryIdentityAddresses,
} from "./config.js";

const factoryAbi = parseAbi([
  "function treasuryOf(bytes32 organizationId) view returns (address)",
  "function createTreasury(bytes32 organizationId, address owner) returns (address)",
  "event TreasuryCreated(bytes32 indexed organizationId, address indexed treasury, address indexed owner, address token)",
]);
const treasuryAbi = parseAbi([
  "function owner() view returns (address)",
  "function paymentToken() view returns (address)",
  "function paused() view returns (bool)",
  "function balance() view returns (uint256)",
  "function getAvailableBalance() view returns (uint256)",
  "function totalReserved() view returns (uint256)",
  "function deposit(uint256 amount)",
  "function pause()",
  "function unpause()",
  "function withdraw(uint256 amount,address recipient,uint256 nonce,uint256 deadline,bytes signature)",
  "event Deposited(address indexed sender,uint256 amount,uint256 newBalance)",
  "event Withdrawn(address indexed recipient,uint256 amount,uint256 newBalance)",
  "event TreasuryPaused(address indexed by)",
  "event TreasuryUnpaused(address indexed by)",
  "event FundsReserved(bytes32 indexed paymentId,bytes32 indexed agentKey,uint256 amount,uint256 totalReserved)",
  "event PaymentSettled(bytes32 indexed paymentId,address indexed recipient,uint256 amount,uint256 totalReserved)",
  "event ReservationReleased(bytes32 indexed paymentId,uint256 amount,uint256 totalReserved)",
]);
const erc20Abi = parseAbi([
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const capabilityAbi = parseAbi([
  "function createCapability(bytes32 organizationId,address treasury,bytes32 agentKey,uint128 budget,uint128 maxPerTransaction,uint64 validAfter,uint64 validUntil,bool canDelegate,address[] tokens,address[] recipients,bytes32[] services,bytes32 policyHash) returns (bytes32)",
  "function delegateCapability(bytes32 parentId,bytes32 childAgentKey,address childSigner,uint128 childBudget,uint128 childMaxTransaction,uint64 childExpiry,address[] childTokens,address[] childRecipients,bytes32[] childServices,bytes32 childPolicyHash) returns (bytes32)",
  "function revokeCapability(bytes32 capabilityId)",
  "function updateCapability(bytes32 capabilityId,uint128 newMaxPerTransaction,uint64 newValidUntil,bytes32 policyHash)",
  "function availableBudget(bytes32 capabilityId) view returns (uint128)",
  "function isCapabilityActive(bytes32 capabilityId) view returns (bool)",
  "function getCapability(bytes32 capabilityId) view returns ((bytes32 id,bytes32 parentId,bytes32 agentKey,address treasury,uint128 budget,uint128 spent,uint128 reserved,uint128 childAllocated,uint128 maxPerTransaction,bytes32 policyHash,uint64 validAfter,uint64 validUntil,uint8 depth,bool canDelegate,bool revoked,bool exists))",
  "function getChildren(bytes32 capabilityId) view returns (bytes32[])",
  "event CapabilityCreated(bytes32 indexed capabilityId,bytes32 indexed organizationId,bytes32 indexed agentKey,bytes32 parentId,address treasury,uint128 budget,bytes32 policyHash)",
]);

function clientFor(chainId: number): PublicClient {
  const rpcUrl = rpcUrls[String(chainId)];
  if (!rpcUrl)
    throw new Error(`Treasury chain ${chainId} RPC is not configured`);
  return createPublicClient({ transport: http(rpcUrl) });
}

export function approvedTokenFor(
  chainId: number,
  tokenAddress: string,
): { symbol: string; decimals: number } {
  const tokens = approvedTokens[String(chainId)] ?? {};
  const found = Object.entries(tokens).find(
    ([address]) => getAddress(address) === getAddress(tokenAddress),
  );
  if (!found)
    throw Object.assign(new Error("Token is not approved for this chain"), {
      code: "UNSUPPORTED_TOKEN",
      statusCode: 400,
    });
  return found[1];
}

export async function deployTreasury(input: {
  chainId: number;
  organizationKey: `0x${string}`;
  owner: Address;
}): Promise<{
  factory: Address;
  transactionData: `0x${string}`;
  tokenAddress: Address;
  token: { symbol: string; decimals: number };
}> {
  const publicClient = clientFor(input.chainId);
  const factory = treasuryFactoryAddresses[String(input.chainId)] as
    Address | undefined;
  const identity = treasuryIdentityAddresses[String(input.chainId)];
  if (!factory || !identity)
    throw new Error(
      `Treasury factory or identity contract is not configured for chain ${input.chainId}`,
    );
  const existing = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "treasuryOf",
    args: [input.organizationKey],
  });
  if (existing !== "0x0000000000000000000000000000000000000000") {
    throw Object.assign(
      new Error("Organization already has a treasury on this chain"),
      { code: "TREASURY_ALREADY_EXISTS", statusCode: 409 },
    );
  }
  const tokenAddress = Object.keys(
    approvedTokens[String(input.chainId)] ?? {},
  )[0] as Address | undefined;
  if (!tokenAddress || !approvedTokens[String(input.chainId)]?.[tokenAddress])
    throw new Error(`No approved token configured for chain ${input.chainId}`);
  return {
    factory,
    transactionData: encodeFunctionData({
      abi: factoryAbi,
      functionName: "createTreasury",
      args: [input.organizationKey, input.owner],
    }),
    tokenAddress,
    token: approvedTokenFor(input.chainId, tokenAddress),
  };
}

export async function getTreasuryChainState(input: {
  chainId: number;
  address: Address;
}): Promise<{
  owner: Address;
  tokenAddress: Address;
  paused: boolean;
  balance: bigint;
  availableBalance: bigint;
  reserved: bigint;
  blockNumber: bigint;
}> {
  const publicClient = clientFor(input.chainId);
  const [
    owner,
    tokenAddress,
    paused,
    balance,
    availableBalance,
    reserved,
    blockNumber,
  ] = await Promise.all([
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "owner",
    }),
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "paymentToken",
    }),
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "paused",
    }),
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "balance",
    }),
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "getAvailableBalance",
    }),
    publicClient.readContract({
      address: input.address,
      abi: treasuryAbi,
      functionName: "totalReserved",
    }),
    publicClient.getBlockNumber(),
  ]);
  return {
    owner,
    tokenAddress,
    paused,
    balance,
    availableBalance,
    reserved,
    blockNumber,
  };
}

export async function prepareDeposit(input: {
  chainId: number;
  treasuryAddress: Address;
  ownerAddress: Address;
  amount: bigint;
}): Promise<{
  tokenAddress: Address;
  spender: Address;
  approveData: `0x${string}`;
  depositData: `0x${string}`;
  currentAllowance: bigint;
}> {
  if (input.amount <= 0n) throw new Error("Deposit amount must be positive");
  const publicClient = clientFor(input.chainId);
  const tokenAddress = await publicClient.readContract({
    address: input.treasuryAddress,
    abi: treasuryAbi,
    functionName: "paymentToken",
  });
  const currentAllowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [input.ownerAddress, input.treasuryAddress],
  });
  return {
    tokenAddress,
    spender: input.treasuryAddress,
    approveData: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.treasuryAddress, input.amount],
    }),
    depositData: encodeFunctionData({
      abi: treasuryAbi,
      functionName: "deposit",
      args: [input.amount],
    }),
    currentAllowance,
  };
}

export function ownerTransaction(input: {
  action: "pause" | "unpause" | "withdraw";
  args?: readonly [bigint, Address, bigint, bigint, `0x${string}`];
}): `0x${string}` {
  if (input.action === "withdraw") {
    if (!input.args) throw new Error("Withdrawal arguments are required");
    return encodeFunctionData({
      abi: treasuryAbi,
      functionName: "withdraw",
      args: input.args,
    });
  }
  return encodeFunctionData({
    abi: treasuryAbi,
    functionName: input.action,
    args: [],
  });
}

export async function transactionHistory(input: {
  chainId: number;
  address: Address;
  fromBlock: bigint;
  toBlock?: bigint;
}) {
  const publicClient = clientFor(input.chainId);
  const logs = await publicClient.getLogs({
    address: input.address,
    fromBlock: input.fromBlock,
    toBlock: input.toBlock ?? "latest",
  });
  return parseEventLogs({ abi: treasuryAbi, logs, strict: false });
}

export async function tokenInfo(
  chainId: number,
  tokenAddress: Address,
): Promise<{ symbol: string; decimals: number }> {
  const approved = approvedTokenFor(chainId, tokenAddress);
  const publicClient = clientFor(chainId);
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  if (symbol !== approved.symbol || decimals !== approved.decimals)
    throw new Error(
      "On-chain token metadata does not match configured approved token",
    );
  return approved;
}

export async function erc20Balance(
  chainId: number,
  tokenAddress: Address,
  account: Address,
): Promise<bigint> {
  const publicClient = clientFor(chainId);
  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function confirmedTransaction(
  chainId: number,
  hash: `0x${string}`,
) {
  const publicClient = clientFor(chainId);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
  return {
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    logs: receipt.logs,
  };
}

export async function confirmedTreasuryCreation(input: {
  chainId: number;
  factory: Address;
  hash: `0x${string}`;
  organizationKey: `0x${string}`;
  owner: Address;
  token: Address;
}): Promise<{ address: Address; blockNumber: bigint; logIndex: number }> {
  const publicClient = clientFor(input.chainId);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: input.hash,
    confirmations: 1,
  });
  if (receipt.status !== "success")
    throw new Error("Treasury factory transaction reverted");
  if (
    getAddress(receipt.to ?? "0x0000000000000000000000000000000000000000") !==
    getAddress(input.factory)
  )
    throw new Error(
      "Transaction was not sent to the configured treasury factory",
    );
  const events = parseEventLogs({
    abi: factoryAbi,
    logs: receipt.logs,
    eventName: "TreasuryCreated",
  });
  const created = events.find(
    (event) => event.args.organizationId === input.organizationKey,
  );
  if (
    !created ||
    getAddress(created.args.owner) !== getAddress(input.owner) ||
    getAddress(created.args.token) !== getAddress(input.token)
  ) {
    throw new Error(
      "Treasury creation event does not match organization, owner, and approved token",
    );
  }
  return {
    address: created.args.treasury,
    blockNumber: receipt.blockNumber,
    logIndex: Number(created.logIndex),
  };
}

export function capabilityTransaction(
  chainId: number,
  functionName:
    | "createCapability"
    | "delegateCapability"
    | "revokeCapability"
    | "updateCapability",
  args: readonly unknown[],
): { address: Address; data: `0x${string}` } {
  const address = capabilityContracts[String(chainId)] as Address | undefined;
  if (!address)
    throw new Error(
      `Capability contract is not configured for chain ${chainId}`,
    );
  const data = encodeFunctionData({
    abi: capabilityAbi,
    functionName,
    args,
  } as never);
  return { address, data };
}

export async function readCapability(
  chainId: number,
  capabilityId: `0x${string}`,
) {
  const address = capabilityContracts[String(chainId)] as Address | undefined;
  if (!address)
    throw new Error(
      `Capability contract is not configured for chain ${chainId}`,
    );
  const publicClient = clientFor(chainId);
  const [capability, available, active] = await Promise.all([
    publicClient.readContract({
      address,
      abi: capabilityAbi,
      functionName: "getCapability",
      args: [capabilityId],
    }),
    publicClient.readContract({
      address,
      abi: capabilityAbi,
      functionName: "availableBudget",
      args: [capabilityId],
    }),
    publicClient.readContract({
      address,
      abi: capabilityAbi,
      functionName: "isCapabilityActive",
      args: [capabilityId],
    }),
  ]);
  return { capability, available, active };
}

export async function readCapabilityChildren(
  chainId: number,
  capabilityId: `0x${string}`,
) {
  const address = capabilityContracts[String(chainId)] as Address | undefined;
  if (!address)
    throw new Error(
      `Capability contract is not configured for chain ${chainId}`,
    );
  return clientFor(chainId).readContract({
    address,
    abi: capabilityAbi,
    functionName: "getChildren",
    args: [capabilityId],
  });
}

export async function confirmCapabilityCreation(input: {
  chainId: number;
  hash: `0x${string}`;
  expectedOrg: `0x${string}`;
  expectedAgentKey: `0x${string}`;
  expectedParent: `0x${string}`;
  expectedTreasury: Address;
  expectedBudget: bigint;
  expectedPolicyHash: `0x${string}`;
}) {
  const contract = capabilityContracts[String(input.chainId)] as
    Address | undefined;
  if (!contract)
    throw new Error(
      `Capability contract is not configured for chain ${input.chainId}`,
    );
  const receipt = await clientFor(input.chainId).waitForTransactionReceipt({
    hash: input.hash,
    confirmations: 1,
  });
  if (
    receipt.status !== "success" ||
    getAddress(receipt.to ?? "0x0000000000000000000000000000000000000000") !==
      contract
  )
    throw new Error(
      "Capability transaction failed or was sent to the wrong contract",
    );
  const events = parseEventLogs({
    abi: capabilityAbi,
    logs: receipt.logs,
    eventName: "CapabilityCreated",
  });
  const event = events.find(
    ({ args }) =>
      args.organizationId === input.expectedOrg &&
      args.agentKey === input.expectedAgentKey &&
      args.parentId === input.expectedParent &&
      getAddress(args.treasury) === input.expectedTreasury &&
      args.budget === input.expectedBudget &&
      args.policyHash === input.expectedPolicyHash,
  );
  if (!event)
    throw new Error(
      "Confirmed transaction does not contain the expected capability event",
    );
  return {
    capabilityId: event.args.capabilityId,
    contract,
    blockNumber: receipt.blockNumber,
  };
}

export const treasuryEventAbi = treasuryAbi;
