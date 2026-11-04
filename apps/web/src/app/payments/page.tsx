import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function PaymentsPage() {
  return (
    <IntegrationPending
      title="Payment lifecycle data is not connected"
      description="Payment authorization, reservation and settlement endpoints are not implemented in the current API."
    />
  );
}
