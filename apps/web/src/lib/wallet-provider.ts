import { getAddress } from "viem";

export interface Eip1193Provider {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export async function signMessageWithConnectedAddress(
  expectedAddress: string,
  message: string,
): Promise<{ address: string; signature: string }> {
  const provider = window.ethereum;
  if (!provider)
    throw new Error("No EVM wallet provider is available in this browser.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("The wallet did not return an account address.");
  }
  const address = getAddress(accounts[0]);
  const expected = getAddress(expectedAddress);
  if (address !== expected) {
    throw new Error(
      "Connect the wallet for the new signer address before signing.",
    );
  }
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, address],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error("The wallet returned an invalid signature.");
  }
  return { address, signature };
}
