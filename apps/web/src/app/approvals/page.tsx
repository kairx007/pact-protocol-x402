import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function ApprovalsPage() {
  return (
    <IntegrationPending
      title="Owner approval queue is not connected"
      description="There are no approval endpoints in the current API. Owner authorization will be added with the approvals phase."
    />
  );
}
