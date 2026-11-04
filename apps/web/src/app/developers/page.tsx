import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function DevelopersPage() {
  return (
    <IntegrationPending
      title="Developer integrations are not connected"
      description="API key, webhook, SDK and MCP management are not available in the current API."
    />
  );
}
