import { CircleHelp, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export function IntegrationPending({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-5">
      <Card className="flex items-start gap-3.5 p-4 sm:items-center sm:p-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
          <CircleHelp size={18} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted sm:text-[13px]">
            {description}
          </p>
        </div>
        <Badge tone="neutral" className="hidden shrink-0 sm:inline-flex">
          Integration pending
        </Badge>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                Trust model
              </span>
              <h2 className="mt-2 text-base font-semibold tracking-tight">
                Authority is explicit
              </h2>
            </div>
            <ShieldCheck
              size={18}
              className="mt-0.5 text-brand"
              strokeWidth={1.8}
            />
          </div>
          <p className="mt-4 max-w-lg text-[13px] leading-6 text-muted">
            Agent identity and organization access are separate from financial
            permission. Smart contracts remain the final authority for spending.
          </p>
          <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-brand" />
            Identity does not grant spending authority
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                Data status
              </span>
              <h2 className="mt-2 text-base font-semibold tracking-tight">
                Awaiting connected data
              </h2>
            </div>
          </div>
          <EmptyState
            title="No organization data yet"
            description="Financial figures and activity will appear here once an organization is connected to authoritative data sources."
          />
        </Card>
      </div>
      <div className="px-1 text-xs leading-5 text-muted">
        Authorization, reservation and settlement are tracked as distinct
        states. A submitted transaction is not treated as settled.
      </div>
    </div>
  );
}
