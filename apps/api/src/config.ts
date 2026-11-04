import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1).default("pact"),
  AUTH_HMAC_SECRET: z.string().min(32),
  RPC_URLS_JSON: z.string().default("{}"),
  ERC8004_REGISTRIES_JSON: z.string().default("{}"),
  APPROVED_TOKENS_JSON: z.string().default("{}"),
  TREASURY_FACTORY_ADDRESSES_JSON: z.string().default("{}"),
  TREASURY_IDENTITY_ADDRESSES_JSON: z.string().default("{}"),
  TREASURY_RELAYER_PRIVATE_KEYS_JSON: z.string().default("{}"),
  TREASURY_WITHDRAWAL_SIGNERS_JSON: z.string().default("{}"),
  MERA_ENABLED: z.enum(["true", "false"]).default("false"),
});

export const config = envSchema.parse(process.env);
export const rpcUrls = z
  .record(z.string(), z.url())
  .parse(JSON.parse(config.RPC_URLS_JSON));
export const erc8004Registries = z
  .record(z.string(), z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)))
  .parse(JSON.parse(config.ERC8004_REGISTRIES_JSON));
export const approvedTokens = z
  .record(
    z.string(),
    z.record(
      z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      z.object({
        symbol: z.string().min(1),
        decimals: z.number().int().min(0).max(255),
      }),
    ),
  )
  .parse(JSON.parse(config.APPROVED_TOKENS_JSON));
export const treasuryFactoryAddresses = z
  .record(z.string(), z.string().regex(/^0x[0-9a-fA-F]{40}$/))
  .parse(JSON.parse(config.TREASURY_FACTORY_ADDRESSES_JSON));
export const treasuryIdentityAddresses = z
  .record(z.string(), z.string().regex(/^0x[0-9a-fA-F]{40}$/))
  .parse(JSON.parse(config.TREASURY_IDENTITY_ADDRESSES_JSON));
export const treasuryRelayerPrivateKeys = z
  .record(z.string(), z.string().regex(/^0x[0-9a-fA-F]{64}$/))
  .parse(JSON.parse(config.TREASURY_RELAYER_PRIVATE_KEYS_JSON));
