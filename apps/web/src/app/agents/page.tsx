import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function AgentsPage() {
  return (
    <IntegrationPending
      title="Agent registry data is not connected"
      description="Agent routes exist in the API, but this foundation phase does not yet include authenticated organization context or agent workflows."
    />
  );
}
