import type {
  AgentStatus,
  GuardrailDecision,
  PaymentStatus,
} from "@pact/shared";
import { Badge } from "@/components/ui/badge";

type Status = AgentStatus | GuardrailDecision | PaymentStatus;

const toneByStatus: Record<
  Status,
  "neutral" | "success" | "warning" | "danger" | "brand"
> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REVOKED: "danger",
  ALLOW: "success",
  DENY: "danger",
  REVIEW: "warning",
  CREATED: "neutral",
  EVALUATING: "neutral",
  REVIEW_REQUIRED: "warning",
  RESERVED: "brand",
  SETTLEMENT_PENDING: "warning",
  SETTLED: "success",
  RELEASE_PENDING: "warning",
  RELEASED: "neutral",
  REJECTED: "danger",
  EXPIRED: "neutral",
  FAILED: "danger",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge tone={toneByStatus[status]}>{status.replaceAll("_", " ")}</Badge>
  );
}
