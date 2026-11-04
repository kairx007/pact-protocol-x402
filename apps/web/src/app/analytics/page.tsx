import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function AnalyticsPage() {
  return (
    <IntegrationPending
      title="Analytics data is not connected"
      description="The API does not currently provide analytics data, so no charts or derived financial totals are shown."
    />
  );
}
