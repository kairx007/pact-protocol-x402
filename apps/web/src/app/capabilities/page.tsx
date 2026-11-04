import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function CapabilitiesPage() {
  return (
    <IntegrationPending
      title="Capabilities are not available yet"
      description="No capability API or contract interface is currently available to display bounded budgets or delegation."
    />
  );
}
