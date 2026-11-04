import { createPublicClient, getAddress, http, type Address } from "viem";
import { erc8004Registries, rpcUrls } from "./config.js";

const identityRegistryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export interface VerifiedIdentity {
  owner: Address;
  wallet: Address;
  registrationURI: string;
}

export async function verifyErc8004Identity(input: {
  chainId: number;
  registryAddress: string;
  agentId: string;
  signerAddress: string;
}): Promise<VerifiedIdentity> {
  const registryAddress = getAddress(input.registryAddress);
  const signerAddress = getAddress(input.signerAddress);
  const configured = erc8004Registries[String(input.chainId)] ?? [];
  if (!configured.some((address) => getAddress(address) === registryAddress)) {
    throw Object.assign(
      new Error("ERC-8004 registry is not configured for this chain"),
      {
        code: "IDENTITY_REGISTRY_NOT_ALLOWED",
        statusCode: 400,
      },
    );
  }
  const rpcUrl = rpcUrls[String(input.chainId)];
  if (!rpcUrl) {
    throw Object.assign(new Error("RPC is not configured for this chain"), {
      code: "CHAIN_NOT_CONFIGURED",
      statusCode: 503,
    });
  }
  const client = createPublicClient({ transport: http(rpcUrl) });
  try {
    const [owner, wallet, registrationURI] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [BigInt(input.agentId)],
      }),
      client.readContract({
        address: registryAddress,
        abi: identityRegistryAbi,
        functionName: "getAgentWallet",
        args: [BigInt(input.agentId)],
      }),
      client.readContract({
        address: registryAddress,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [BigInt(input.agentId)],
      }),
    ]);
    const normalizedWallet =
      wallet === "0x0000000000000000000000000000000000000000" ? owner : wallet;
    if (getAddress(normalizedWallet) !== signerAddress) {
      throw Object.assign(
        new Error("Agent signer does not match the ERC-8004 registered wallet"),
        {
          code: "IDENTITY_SIGNER_MISMATCH",
          statusCode: 422,
        },
      );
    }
    return { owner, wallet: normalizedWallet, registrationURI };
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw Object.assign(
      new Error("ERC-8004 identity does not exist or registry query failed"),
      {
        code: "IDENTITY_NOT_VERIFIED",
        statusCode: 422,
      },
    );
  }
}
