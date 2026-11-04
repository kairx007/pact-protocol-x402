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
  MERA_ENABLED: z.enum(["true", "false"]).default("false"),
});

export const config = envSchema.parse(process.env);
export const rpcUrls = z
  .record(z.string(), z.url())
  .parse(JSON.parse(config.RPC_URLS_JSON));
export const erc8004Registries = z
  .record(z.string(), z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)))
  .parse(JSON.parse(config.ERC8004_REGISTRIES_JSON));
