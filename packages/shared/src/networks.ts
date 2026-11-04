import type { Environment } from "./types.js";

export interface NetworkConfig {
  chainId: number | undefined;
  name: string;
  rpcUrl: string | undefined;
}

/** Devnet chain ID remains unset until verified against official Monad information. */
export const networks: Record<Environment, NetworkConfig> = {
  local: { chainId: 31337, name: "Anvil", rpcUrl: process.env.ANVIL_RPC_URL },
  devnet: {
    chainId: undefined,
    name: "Monad Devnet",
    rpcUrl: process.env.MONAD_DEVNET_RPC,
  },
  testnet: {
    chainId: 10143,
    name: "Monad Testnet",
    rpcUrl: process.env.MONAD_TESTNET_RPC,
  },
  mainnet: {
    chainId: 143,
    name: "Monad Mainnet",
    rpcUrl: process.env.MONAD_MAINNET_RPC,
  },
};
