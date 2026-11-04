import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CircleHelp,
  CreditCard,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const summaryItems = [
  { label: "Treasury balance", icon: Wallet },
  { label: "Available to spend", icon: ShieldCheck },
  { label: "Active agents", icon: Users },
  { label: "Payments this month", icon: CreditCard },
];

export function OverviewPending() {
  return (
    <div className="grid gap-6">
      <Card className="flex items-start gap-3.5 border-brand/10 bg-brand-soft/35 p-4 sm:items-center sm:p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand ring-1 ring-brand/10">
          <CircleHelp size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            Overview data is not connected
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted sm:text-[13px]">
            Treasury and analytics endpoints are not available yet. Summary
            values will appear when authoritative data sources are connected.
          </p>
        </div>
        <Badge
          tone="neutral"
          className="hidden shrink-0 border border-border/70 bg-white/80 sm:inline-flex"
        >
          Integration pending
        </Badge>
      </Card>

      <section
        aria-label="Organization summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {summaryItems.map(({ label, icon: Icon }) => (
          <Card key={label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium text-muted">{label}</h2>
              <Icon
                size={16}
                className="text-subtle"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </div>
            <p
              className="mt-5 text-2xl font-semibold tracking-tight text-subtle"
              aria-label={`${label}: unavailable`}
            >
              —
            </p>
            <p className="mt-1 text-[11px] text-subtle">Not available</p>
          </Card>
        ))}
      </section>

      <section
        aria-label="Financial activity"
        className="grid gap-4 lg:grid-cols-[1.35fr_1fr]"
      >
        <Card className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Treasury activity
              </h2>
              <p className="mt-1 text-xs text-muted">
                Deposits and agent spending over time
              </p>
            </div>
            <Activity
              size={17}
              className="text-subtle"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>
          <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-5 py-6 text-center">
            <span
              className="mb-3 flex items-center gap-1 text-subtle"
              aria-hidden="true"
            >
              <ArrowDownLeft size={15} />
              <span className="mx-1 h-px w-5 bg-border" />
              <ArrowUpRight size={15} />
            </span>
            <p className="text-xs font-medium text-foreground">
              Activity will appear here
            </p>
            <p className="mt-1 max-w-xs text-[11px] leading-5 text-muted">
              No chart is shown until treasury activity data is available.
            </p>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Spending by agent
            </h2>
            <p className="mt-1 text-xs text-muted">
              Ranked by verified activity
            </p>
          </div>
          <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-5 py-6 text-center">
            <EmptyState
              title="No agent activity available"
              description="Agent spending will be listed once analytics data is connected."
            />
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Recent payments
            </h2>
            <p className="mt-1 text-xs text-muted">
              Authorization and settlement are shown separately
            </p>
          </div>
          <Badge tone="neutral">No connected data</Badge>
        </div>
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-3 border-b border-border bg-background/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-subtle sm:px-5">
          <span>Agent</span>
          <span>Recipient</span>
          <span>Authorization</span>
          <span>Settlement</span>
        </div>
        <div className="px-2 py-1">
          <EmptyState
            title="No payments to display"
            description="Payment records will appear here when the payments API and settlement data are available."
          />
        </div>
      </Card>
    </div>
  );
}
