"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck, Users, Wallet } from "lucide-react";
import { z } from "zod";
import { apiRequest, apiErrorMessage } from "@/lib/api";
import { formatBaseUnits } from "@/lib/amount";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { organizationSchema, treasuryBalanceSchema } from "./schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const agentSchema = z.array(z.object({ status: z.string() }));
type LoadState<T> = { data?: T; error?: string; loading: boolean };
const metrics = [
  { label: "Treasury balance", icon: Wallet },
  { label: "Available to spend", icon: ShieldCheck },
  { label: "Active agents", icon: Users },
  { label: "Payments this month", icon: CreditCard },
];

export function OverviewWorkspace() {
  const { organizationId, treasuryId } = useWorkspace();
  const [organization, setOrganization] = useState<
    LoadState<z.infer<typeof organizationSchema>>
  >({ loading: false });
  const [agents, setAgents] = useState<LoadState<z.infer<typeof agentSchema>>>({
    loading: false,
  });
  const [balance, setBalance] = useState<
    LoadState<z.infer<typeof treasuryBalanceSchema>>
  >({ loading: false });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setOrganization({ loading: false });
      setAgents({ loading: false });
      return () => {
        alive = false;
      };
    }
    setOrganization({ loading: true });
    setAgents({ loading: true });
    void apiRequest(
      "/v1/organizations/" + encodeURIComponent(organizationId),
      organizationSchema,
    )
      .then((data) => alive && setOrganization({ data, loading: false }))
      .catch(
        (error: unknown) =>
          alive &&
          setOrganization({ error: apiErrorMessage(error), loading: false }),
      );
    void apiRequest(
      "/v1/agents?organizationId=" + encodeURIComponent(organizationId),
      agentSchema,
    )
      .then((data) => alive && setAgents({ data, loading: false }))
      .catch(
        (error: unknown) =>
          alive && setAgents({ error: apiErrorMessage(error), loading: false }),
      );
    return () => {
      alive = false;
    };
  }, [organizationId, refresh]);

  useEffect(() => {
    let alive = true;
    if (!treasuryId) {
      setBalance({ loading: false });
      return () => {
        alive = false;
      };
    }
    setBalance({ loading: true });
    void apiRequest(
      "/v1/treasuries/" + encodeURIComponent(treasuryId) + "/balance",
      treasuryBalanceSchema,
    )
      .then((data) => alive && setBalance({ data, loading: false }))
      .catch(
        (error: unknown) =>
          alive &&
          setBalance({ error: apiErrorMessage(error), loading: false }),
      );
    return () => {
      alive = false;
    };
  }, [treasuryId, refresh]);

  const values = [
    balance.data
      ? formatBaseUnits(balance.data.balance, balance.data.tokenDecimals) +
        " " +
        balance.data.tokenSymbol
      : "—",
    balance.data
      ? formatBaseUnits(
          balance.data.availableBalance,
          balance.data.tokenDecimals,
        ) +
        " " +
        balance.data.tokenSymbol
      : "—",
    agents.data
      ? String(agents.data.filter((agent) => agent.status === "ACTIVE").length)
      : "—",
    "—",
  ];
  const helper = [
    balance.data
      ? "On-chain read · block " + balance.data.blockNumber
      : (balance.error ??
        (balance.loading
          ? "Loading authoritative balance…"
          : treasuryId
            ? "No balance returned"
            : "Select a treasury ID to load")),
    balance.data
      ? "Reserved funds excluded · " +
        formatBaseUnits(balance.data.reserved, balance.data.tokenDecimals) +
        " " +
        balance.data.tokenSymbol +
        " reserved"
      : (balance.error ?? "Requires treasury balance API"),
    agents.data
      ? "From organization agent registry"
      : (agents.error ??
        (agents.loading
          ? "Loading agent registry…"
          : "Select an organization ID to load")),
    "Payments API is not implemented",
  ];

  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center gap-3 border-brand/10 bg-brand-soft/35 p-4 sm:p-5">
        <span className="grid size-9 place-items-center rounded-md bg-white text-brand ring-1 ring-brand/10">
          <ShieldCheck size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Live workspace data</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Values are requested from the configured PACT API. Missing values
            stay unavailable; no sample financial data is shown.
          </p>
        </div>
        {!organizationId && (
          <Link
            href="/onboarding"
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-xs font-medium text-white hover:bg-brand-hover"
          >
            Set up organization
          </Link>
        )}
        <Badge tone={organization.data ? "success" : "neutral"}>
          {organization.data?.status ??
            (organization.loading ? "Loading" : "Not connected")}
        </Badge>
        <Button
          variant="secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </Button>
      </Card>
      {organization.error && (
        <p
          role="alert"
          className="rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger"
        >
          Organization: {organization.error}
        </p>
      )}
      <section
        aria-label="Organization summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map(({ label, icon: Icon }, index) => (
          <Card key={label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium text-muted">{label}</h2>
              <Icon size={16} className="text-subtle" aria-hidden="true" />
            </div>
            <p className="mt-5 text-2xl font-semibold tracking-tight">
              {(index < 2 && balance.loading) || (index === 2 && agents.loading)
                ? "…"
                : values[index]}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {helper[index]}
            </p>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">Treasury activity</h2>
              <p className="mt-1 text-xs text-muted">
                Deposits and agent spending by date
              </p>
            </div>
            <Badge tone="neutral">Analytics unavailable</Badge>
          </div>
          <div className="mt-5 grid min-h-40 place-items-center rounded-md border border-dashed border-border bg-background px-5 text-center">
            <p className="max-w-sm text-xs leading-5 text-muted">
              No chart is displayed because the analytics overview and spending
              routes are not implemented.
            </p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">Spending by agent</h2>
              <p className="mt-1 text-xs text-muted">
                Verified spending activity
              </p>
            </div>
            <Link href="/agents" className="text-xs font-medium text-brand">
              View agents
            </Link>
          </div>
          <div className="mt-5 grid min-h-40 place-items-center rounded-md border border-dashed border-border bg-background px-5 text-center">
            <p className="max-w-sm text-xs leading-5 text-muted">
              Agent records can be loaded, but spending analytics are not
              available yet. {agents.error ? "Registry: " + agents.error : ""}
            </p>
          </div>
        </Card>
      </section>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Recent payments</h2>
            <p className="mt-1 text-xs text-muted">
              Authorization and settlement remain separate states
            </p>
          </div>
          <Badge tone="neutral">Payments API unavailable</Badge>
        </div>
        <div className="grid grid-cols-4 gap-3 bg-background px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span>Agent</span>
          <span>Recipient</span>
          <span>Authorization</span>
          <span>Settlement</span>
        </div>
        <div className="grid min-h-28 place-items-center px-5 text-center text-xs text-muted">
          No payment records are shown until the backend exposes a payments
          listing endpoint.
        </div>
      </Card>
    </div>
  );
}
