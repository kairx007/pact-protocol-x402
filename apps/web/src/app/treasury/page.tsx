import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function TreasuryPage() {
  return (
    <IntegrationPending
      title="Treasury integration is pending"
      description="Treasury endpoints are available in the API. Dashboard integration is planned for a later phase and will distinguish on-chain balances from indexed activity."
    />
  );
}
