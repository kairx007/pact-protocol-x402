import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function GuardrailsPage() {
  return (
    <IntegrationPending
      title="Guardrail policies are not connected"
      description="Policy management and evaluation interfaces are not available in the current API."
    />
  );
}
