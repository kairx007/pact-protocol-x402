import { IntegrationPending } from "@/components/dashboard/integration-pending";

export default function SettingsPage() {
  return (
    <IntegrationPending
      title="Organization settings are not connected"
      description="Organization creation and wallet routes exist, but authentication and onboarding flows are outside this foundation phase."
    />
  );
}
