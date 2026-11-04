/**
 * Mera is a client-side passkey account library. This backend adapter accepts
 * only a wallet address whose ownership has already been proved by a signed,
 * one-time challenge; it never receives or stores a passkey or private key.
 */
export interface WalletProofVerifier {
  verify(input: {
    address: string;
    message: string;
    signature: string;
  }): Promise<boolean>;
}

export class MeraIntegration {
  constructor(private readonly verifier: WalletProofVerifier) {}

  async verifyLinkedWallet(input: {
    address: string;
    message: string;
    signature: string;
  }): Promise<boolean> {
    return this.verifier.verify(input);
  }
}
