import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function AuditPage() {
  return (
    <IntegrationPending
      title="Audit events are not connected"
      description="No audit event endpoint is currently available. Database records will not be presented as proof of blockchain settlement."
    />
  );
}
