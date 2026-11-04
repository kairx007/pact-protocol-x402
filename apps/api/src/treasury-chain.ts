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

export const treasuryEventAbi = treasuryAbi;
