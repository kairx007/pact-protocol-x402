"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { apiRequest, apiErrorMessage } from "@/lib/api";
import { formatBaseUnits } from "@/lib/amount";
import { useWorkspace } from "@/features/workspace/workspace-context";
import {
  treasuryBalanceSchema,
  treasurySchema,
  treasuryTransactionsSchema,
  type TreasuryBalanceDto,
  type TreasuryDto,
  type TreasuryTransactionDto,
} from "./schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type State<T> = { data?: T; error?: string; loading: boolean };
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZoneName: "short",
      }).format(date);
}
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function TreasuryWorkspace() {
  const { treasuryId } = useWorkspace();
  const [treasury, setTreasury] = useState<State<TreasuryDto>>({
    loading: false,
  });
  const [balance, setBalance] = useState<State<TreasuryBalanceDto>>({
    loading: false,
  });
  const [transactions, setTransactions] = useState<
    State<TreasuryTransactionDto[]>
  >({ loading: false });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!treasuryId) {
      setTreasury({ loading: false });
      setBalance({ loading: false });
      setTransactions({ loading: false });
      return () => {
        alive = false;
      };
    }
    setTreasury({ loading: true });
    setBalance({ loading: true });
    setTransactions({ loading: true });
    const requests = [
      apiRequest(
        "/v1/treasuries/" + encodeURIComponent(treasuryId),
        treasurySchema,
      )
        .then((data) => alive && setTreasury({ data, loading: false }))
        .catch(
          (error: unknown) =>
            alive &&
            setTreasury({ error: apiErrorMessage(error), loading: false }),
        ),
      apiRequest(
        "/v1/treasuries/" + encodeURIComponent(treasuryId) + "/balance",
        treasuryBalanceSchema,
      )
        .then((data) => alive && setBalance({ data, loading: false }))
        .catch(
          (error: unknown) =>
            alive &&
            setBalance({ error: apiErrorMessage(error), loading: false }),
        ),
      apiRequest(
        "/v1/treasuries/" + encodeURIComponent(treasuryId) + "/transactions",
        treasuryTransactionsSchema,
      )
        .then((data) => alive && setTransactions({ data, loading: false }))
        .catch(
          (error: unknown) =>
            alive &&
            setTransactions({ error: apiErrorMessage(error), loading: false }),
        ),
    ];
    void Promise.all(requests);
    return () => {
      alive = false;
    };
  }, [treasuryId, refresh]);

  const amount = (value: string | undefined) =>
    value && balance.data
      ? formatBaseUnits(value, balance.data.tokenDecimals) +
        " " +
        balance.data.tokenSymbol
      : "—";
  const statusTone =
    treasury.data?.status === "ACTIVE"
      ? "success"
      : treasury.data?.status === "PAUSED"
        ? "danger"
        : "warning";

  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="grid size-9 place-items-center rounded-md bg-brand-soft text-brand">
          <Wallet size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Organization treasury</h2>
          <p className="mt-1 text-xs text-muted">
            Balances are read from the treasury API and reflect on-chain state
            at the returned block.
          </p>
        </div>
        <Badge tone={treasury.data ? statusTone : "neutral"}>
          {treasury.data?.status ??
            (treasury.loading || balance.loading
              ? "Loading"
              : "No treasury selected")}
        </Badge>
        <Button
          variant="secondary"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={!treasuryId || treasury.loading}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </Card>
      {!treasuryId && (
        <Card>
          <EmptyState
            title="Select a treasury"
            description="Use the workspace selector in the top bar to enter a treasury ID. The backend does not yet return a treasury ID from organization details."
          />
        </Card>
      )}
      {treasury.error && (
        <p
          role="alert"
          className="rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger"
        >
          Treasury: {treasury.error}
        </p>
      )}
      {balance.error && (
        <p
          role="alert"
          className="rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger"
        >
          Balance: {balance.error}
        </p>
      )}
      {treasury.data && (
        <>
          <section
            aria-label="Treasury balances"
            className="grid gap-3 sm:grid-cols-3"
          >
            {[
              ["On-chain balance", balance.data?.balance],
              ["Reserved", balance.data?.reserved],
              ["Available", balance.data?.availableBalance],
            ].map(([title, amountValue]) => (
              <Card key={title} className="p-5">
                <p className="text-xs font-medium text-muted">{title}</p>
                <p className="mt-4 break-words text-2xl font-semibold tracking-tight">
                  {balance.loading ? "…" : amount(amountValue)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {balance.data
                    ? "Token decimals: " +
                      balance.data.tokenDecimals +
                      " · block " +
                      balance.data.blockNumber
                    : "Authoritative balance unavailable"}
                </p>
              </Card>
            ))}
          </section>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Treasury details</h2>
                <p className="mt-1 text-xs text-muted">
                  Network configuration is taken from the treasury record.
                </p>
              </div>
              <Badge tone={statusTone}>{treasury.data.status}</Badge>
            </div>
            <dl className="mt-5 grid gap-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted">Treasury contract</dt>
                <dd className="mt-1 break-all font-mono text-foreground">
                  {treasury.data.contractAddress}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Owner wallet</dt>
                <dd className="mt-1 break-all font-mono text-foreground">
                  {treasury.data.ownerAddress}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Token</dt>
                <dd className="mt-1 break-all font-mono text-foreground">
                  {treasury.data.tokenSymbol} · {treasury.data.tokenAddress} ·{" "}
                  {treasury.data.tokenDecimals} decimals
                </dd>
              </div>
              <div>
                <dt className="text-muted">Chain ID</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {treasury.data.chainId}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Last synced block</dt>
                <dd className="mt-1 text-foreground">
                  {treasury.data.lastSyncedBlock}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Last updated</dt>
                <dd className="mt-1 text-foreground">
                  {formatDate(treasury.data.updatedAt)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-5 text-muted">
              No explorer link is shown because this frontend has no verified
              explorer URL configuration.
            </p>
          </Card>
          <section
            className="grid gap-4 lg:grid-cols-2"
            aria-label="Treasury actions"
          >
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <ArrowDownToLine size={16} className="text-brand" />
                <h2 className="text-sm font-semibold">Deposit</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                A deposit intent can be prepared by the backend, but this branch
                has no treasury API and no session issuer. The API flow also
                needs wallet transaction submission and confirmation before
                funds can be called deposited.
              </p>
              <Button
                className="mt-4"
                disabled
                title="Requires authenticated session and wallet transaction flow"
              >
                Prepare deposit
              </Button>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine size={16} className="text-brand" />
                <h2 className="text-sm font-semibold">Withdraw</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                Withdrawals require a chain-specific owner signature over the
                contract authorization. The backend expects that signature but
                exposes no nonce/domain preparation API, so signing is not
                enabled.
              </p>
              <Button
                className="mt-4"
                disabled
                variant="secondary"
                title="Requires owner signature preparation and authenticated session"
              >
                Request withdrawal
              </Button>
            </Card>
          </section>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Treasury activity</h2>
                <p className="mt-1 text-xs text-muted">
                  Indexed transactions · transaction submission is not
                  settlement confirmation
                </p>
              </div>
              <Badge tone="neutral">
                {transactions.data?.length ??
                  (transactions.loading ? "Loading" : 0)}{" "}
                records
              </Badge>
            </div>
            {transactions.error && (
              <p
                role="alert"
                className="m-4 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
              >
                {transactions.error}
              </p>
            )}
            {transactions.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-background text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Activity</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Block</th>
                      <th className="px-5 py-3 font-semibold">
                        Transaction hash
                      </th>
                      <th className="px-5 py-3 font-semibold">Indexed at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.data.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-5 py-3">
                          <Badge
                            tone={
                              item.type === "DEPOSIT"
                                ? "success"
                                : item.type === "WITHDRAWAL"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {label(item.type)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 tabular-nums">
                          {amount(item.amount)}
                        </td>
                        <td className="px-5 py-3 tabular-nums">
                          {item.blockNumber}
                        </td>
                        <td
                          className="max-w-64 truncate px-5 py-3 font-mono"
                          title={item.transactionHash}
                        >
                          {item.transactionHash}
                        </td>
                        <td className="px-5 py-3">
                          {formatDate(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !transactions.loading && (
                <EmptyState
                  title="No indexed treasury activity"
                  description="Transactions appear here only when returned by the treasury indexer."
                />
              )
            )}
          </Card>
        </>
      )}
    </div>
  );
}
