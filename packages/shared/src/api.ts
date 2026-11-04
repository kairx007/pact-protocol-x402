import { z } from "zod";

export const requestIdSchema = z.string().min(1);
export const tokenAmountSchema = z.object({
  amount: z
    .string()
    .regex(
      /^(0|[1-9]\d*)(\.\d+)?$/,
      "Amount must be a non-negative decimal string",
    ),
  tokenDecimals: z.number().int().min(0).max(255),
});

export const successEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    meta: z.object({ requestId: requestIdSchema }),
  });

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
  meta: z.object({ requestId: requestIdSchema }),
});

export const errorCodes = [
  "ORG_NOT_FOUND",
  "AGENT_NOT_FOUND",
  "AGENT_SIGNATURE_INVALID",
  "AGENT_REVOKED",
  "IDENTITY_NOT_VERIFIED",
  "CAPABILITY_EXPIRED",
  "CAPABILITY_REVOKED",
  "INSUFFICIENT_CAPABILITY_BUDGET",
  "TRANSACTION_LIMIT_EXCEEDED",
  "GUARDRAIL_DENIED",
  "APPROVAL_REQUIRED",
  "PAYMENT_REPLAYED",
  "PAYMENT_ALREADY_SETTLED",
  "RESERVATION_EXPIRED",
  "CHAIN_TRANSACTION_FAILED",
] as const;

export type ErrorCode = (typeof errorCodes)[number];
export type SuccessEnvelope<T> = {
  success: true;
  message: string;
  data: T;
  meta: { requestId: string };
};
export type ErrorEnvelope = {
  success: false;
  message: string;
  error: { code: ErrorCode | string; details: Record<string, unknown> };
  meta: { requestId: string };
};
