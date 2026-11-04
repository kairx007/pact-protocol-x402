"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { registerAgentSchema, rotateAgentSignerSchema } from "@pact/shared";
import { getAddress } from "viem";
import { ApiError, apiErrorMessage, apiRequest } from "@/lib/api";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { signMessageWithConnectedAddress } from "@/lib/wallet-provider";
import {
  agentListSchema,
  agentRecordSchema,
  type AgentRecordDto,
} from "./schemas";

type RequestState<T> = { data?: T; error?: string; loading: boolean };
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date) + " UTC";
};

export function AgentWorkspace() {
  const { organizationId } = useWorkspace();
  const [agents, setAgents] = useState<RequestState<AgentRecordDto[]>>({
    loading: false,
  });
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<AgentRecordDto | null>(null);
  const revokeDialog = useRef<HTMLDialogElement>(null);
  const [rotateFormOpen, setRotateFormOpen] = useState(false);
  const [newSignerAddress, setNewSignerAddress] = useState("");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    registryAddress: "",
    identityId: "",
    chainId: "",
    signerAddress: "",
  });

  useEffect(() => {
    const dialog = revokeDialog.current;
    if (!dialog) return;
    if (revokeTarget && !dialog.open) dialog.showModal();
    else if (!revokeTarget && dialog.open) dialog.close();
  }, [revokeTarget]);

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setAgents({ loading: false });
      return () => {
        alive = false;
      };
    }
    setAgents({ loading: true });
    void apiRequest(
      "/v1/agents?organizationId=" + encodeURIComponent(organizationId),
      agentListSchema,
    )
      .then((data) => {
        if (!alive) return;
        setAgents({ data, loading: false });
        setSelectedId((current) => current || data[0]?.agentId || "");
      })
      .catch(
        (error: unknown) =>
          alive && setAgents({ error: apiErrorMessage(error), loading: false }),
      );
    return () => {
      alive = false;
    };
  }, [organizationId, refresh]);

  const visibleAgents = useMemo(
    () =>
      (agents.data ?? []).filter(
        (agent) =>
          (statusFilter === "ALL" || agent.status === statusFilter) &&
          (agent.name.toLowerCase().includes(filter.toLowerCase()) ||
            agent.agentId.toLowerCase().includes(filter.toLowerCase()) ||
            agent.identity.agentId.includes(filter)),
      ),
    [agents.data, filter, statusFilter],
  );
  const selectedAgent = agents.data?.find(
    (agent) => agent.agentId === selectedId,
  );
  const counts = {
    total: agents.data?.length ?? 0,
    active:
      agents.data?.filter((agent) => agent.status === "ACTIVE").length ?? 0,
    pending:
      agents.data?.filter((agent) => agent.status === "PENDING").length ?? 0,
    revoked:
      agents.data?.filter((agent) => agent.status === "REVOKED").length ?? 0,
  };

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = registerAgentSchema.safeParse({
      organizationId,
      name: form.name,
      description: form.description || undefined,
      registryAddress: form.registryAddress,
      agentId: form.identityId,
      chainId: Number(form.chainId),
      signerAddress: form.signerAddress,
      signerType: "EOA",
    });
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Review the agent details.",
      );
      return;
    }
    setFormBusy(true);
    try {
      const created = await apiRequest(
        "/v1/agents/register",
        agentRecordSchema,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      setAgents((current) => ({
        data: [
          created,
          ...(current.data ?? []).filter(
            (agent) => agent.agentId !== created.agentId,
          ),
        ],
        loading: false,
      }));
      setSelectedId(created.agentId);
      setShowForm(false);
      setForm({
        name: "",
        description: "",
        registryAddress: "",
        identityId: "",
        chainId: "",
        signerAddress: "",
      });
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setFormBusy(false);
    }
  }

  async function verifyIdentity(agent: AgentRecordDto) {
    setBusyAction(agent.agentId);
    setActionError("");
    try {
      const updated = await apiRequest(
        "/v1/agents/" + encodeURIComponent(agent.agentId) + "/verify-identity",
        agentRecordSchema,
        {
          method: "POST",
          body: JSON.stringify({ organizationId }),
        },
      );
      setAgents((current) => ({
        data: (current.data ?? []).map((item) =>
          item.agentId === updated.agentId ? updated : item,
        ),
        loading: false,
      }));
    } catch (error) {
      setActionError(apiErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  }

  async function revokeAgent(agent: AgentRecordDto) {
    setBusyAction(agent.agentId);
    setActionError("");
    try {
      const updated = await apiRequest(
        "/v1/agents/" + encodeURIComponent(agent.agentId) + "/revoke",
        agentRecordSchema,
        {
          method: "POST",
          body: JSON.stringify({ organizationId }),
        },
      );
      setAgents((current) => ({
        data: (current.data ?? []).map((item) =>
          item.agentId === updated.agentId ? updated : item,
        ),
        loading: false,
      }));
      setRevokeTarget(null);
    } catch (error) {
      setActionError(apiErrorMessage(error));
    } finally {
      setBusyAction("");
    }
  }

  async function rotateSigner(agent: AgentRecordDto) {
    setBusyAction(agent.agentId);
    setActionError("");
    try {
      const signerAddress = getAddress(newSignerAddress);
      const message = [
        "PACT agent signer rotation",
        "Organization ID: " + organizationId,
        "Agent ID: " + agent.agentId,
        "New signer: " + signerAddress,
        "Nonce: " + window.crypto.randomUUID(),
      ].join("\n");
      const signed = await signMessageWithConnectedAddress(
        signerAddress,
        message,
      );
      const proof = rotateAgentSignerSchema.safeParse({
        organizationId,
        signerAddress: signed.address,
        signerType: "EOA",
        proof: signed.signature,
        message,
      });
      if (!proof.success) {
        setActionError(
          proof.error.issues[0]?.message ??
            "The wallet proof did not validate.",
        );
        return;
      }
      const updated = await apiRequest(
        "/v1/agents/" + encodeURIComponent(agent.agentId) + "/rotate-key",
        agentRecordSchema,
        { method: "POST", body: JSON.stringify(proof.data) },
      );
      setAgents((current) => ({
        data: (current.data ?? []).map((item) =>
          item.agentId === updated.agentId ? updated : item,
        ),
        loading: false,
      }));
      setRotateFormOpen(false);
      setNewSignerAddress("");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? apiErrorMessage(error)
          : error instanceof Error
            ? error.message
            : apiErrorMessage(error),
      );
    } finally {
      setBusyAction("");
    }
  }

  if (!organizationId) {
    return (
      <Card>
        <EmptyState
          title="Select an organization"
          description="Choose an existing organization ID from the top-bar workspace selector before loading or registering agents."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="grid size-9 place-items-center rounded-md bg-brand-soft text-brand">
          <UserRound size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Organization agent registry</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            ERC-8004 identity and PACT access are shown separately. Identity
            verification does not grant spending authority.
          </p>
        </div>
        <Badge tone="neutral">Org {organizationId.slice(0, 8)}</Badge>
        <Button
          variant="secondary"
          disabled={agents.loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setShowForm((value) => !value);
            setFormError("");
          }}
        >
          <Plus size={15} />
          Register agent
        </Button>
      </Card>
      {agents.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger"
        >
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">{agents.error}</div>
          <Button
            size="default"
            variant="ghost"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}

      {showForm && (
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Register an ERC-8004 agent
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                PACT checks the registry identity and signer through the backend
                before saving the agent. The form never requests key material.
              </p>
            </div>
            <Badge tone="neutral">EOA signer</Badge>
          </div>
          <form onSubmit={register} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">
              Agent name
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Description{" "}
              <span className="font-normal text-muted">Optional</span>
              <input
                maxLength={2000}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">
              ERC-8004 registry address
              <input
                required
                spellCheck={false}
                value={form.registryAddress}
                onChange={(event) =>
                  setForm({ ...form, registryAddress: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 font-mono text-xs font-normal"
                placeholder="0x…"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              ERC-8004 Agent ID
              <input
                required
                inputMode="numeric"
                pattern="0|[1-9][0-9]*"
                value={form.identityId}
                onChange={(event) =>
                  setForm({ ...form, identityId: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 font-mono text-xs font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Identity chain ID
              <input
                required
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                value={form.chainId}
                onChange={(event) =>
                  setForm({ ...form, chainId: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 font-mono text-xs font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">
              Agent signer address
              <input
                required
                spellCheck={false}
                value={form.signerAddress}
                onChange={(event) =>
                  setForm({ ...form, signerAddress: event.target.value })
                }
                className="h-10 rounded-md border border-border bg-white px-3 font-mono text-xs font-normal"
                placeholder="0x…"
              />
              <span className="font-normal text-muted">
                Signer identity is validated against the ERC-8004 registry. It
                does not create spending capability.
              </span>
            </label>
            {formError && (
              <p
                className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger sm:col-span-2"
                role="alert"
              >
                {formError}
              </p>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                variant="primary"
                type="submit"
                disabled={formBusy || !organizationId}
              >
                {formBusy && (
                  <LoaderCircle size={14} className="animate-spin" />
                )}
                {formBusy
                  ? "Verifying and registering…"
                  : "Verify and register"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section
        aria-label="Agent summary"
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {[
          ["Total agents", counts.total],
          ["Active", counts.active],
          ["Pending", counts.pending],
          ["Revoked", counts.revoked],
        ].map(([label, count]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {agents.loading ? "…" : count}
            </p>
            <p className="mt-1 text-[11px] text-muted">Returned by API</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
          <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border border-border bg-white px-3 text-muted">
            <Search size={14} />
            <input
              aria-label="Search agents"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search name or identity ID"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-subtle"
            />
          </label>
          <select
            aria-label="Filter by agent status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-md border border-border bg-white px-3 text-xs"
          >
            <option value="ALL">All statuses</option>
            {["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <span className="text-xs text-muted">
            {visibleAgents.length} of {agents.data?.length ?? 0}
          </span>
        </div>
        {agents.loading ? (
          <div className="grid min-h-40 place-items-center text-xs text-muted">
            <LoaderCircle size={18} className="mb-2 animate-spin" />
            Loading agent records…
          </div>
        ) : visibleAgents.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-background text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Agent</th>
                  <th className="px-5 py-3 font-semibold">ERC-8004 identity</th>
                  <th className="px-5 py-3 font-semibold">Signer</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleAgents.map((agent) => (
                  <tr
                    key={agent.agentId}
                    className={
                      "border-t border-border hover:bg-background/70 " +
                      (agent.agentId === selectedId ? "bg-brand-soft/40" : "")
                    }
                  >
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setSelectedId(agent.agentId)}
                        className="text-left"
                      >
                        <span className="block font-medium text-foreground">
                          {agent.name}
                        </span>
                        <span className="mt-1 block font-mono text-[10px] text-muted">
                          {agent.agentId}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className="block">
                        Token #{agent.identity.agentId}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted">
                        Chain {agent.identity.chainId} ·{" "}
                        {agent.identity.verifiedAt
                          ? "Verified " + dateLabel(agent.identity.verifiedAt)
                          : "Not verified"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="block font-mono text-[10px]">
                        {agent.signer.address}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted">
                        {agent.signer.type}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {dateLabel(agent.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setSelectedId(agent.agentId)}
                        aria-label={"View " + agent.name}
                        className="grid size-8 place-items-center rounded-md hover:bg-surface-muted"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              agents.error ? "Agent records unavailable" : "No agent records"
            }
            description={
              agents.error ??
              "Register an ERC-8004 identity to add the first agent. Identity verification alone does not grant spending authority."
            }
          />
        )}
      </Card>

      {selectedAgent && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                Agent details
              </span>
              <h2 className="mt-1 text-base font-semibold">
                {selectedAgent.name}
              </h2>
              <p className="mt-1 font-mono text-[11px] text-muted">
                Internal ID · {selectedAgent.agentId}
              </p>
            </div>
            <StatusBadge status={selectedAgent.status} />
          </div>
          {actionError && (
            <p
              className="mt-4 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-xs text-danger"
              role="alert"
            >
              {actionError}
            </p>
          )}
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted">ERC-8004 Agent ID</dt>
              <dd className="mt-1 font-mono">
                {selectedAgent.identity.agentId}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Registry</dt>
              <dd className="mt-1 break-all font-mono">
                {selectedAgent.identity.registryAddress}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Identity chain</dt>
              <dd className="mt-1">{selectedAgent.identity.chainId}</dd>
            </div>
            <div>
              <dt className="text-muted">Signer</dt>
              <dd className="mt-1 break-all font-mono">
                {selectedAgent.signer.address} · {selectedAgent.signer.type}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Verified owner</dt>
              <dd className="mt-1 break-all font-mono">
                {selectedAgent.identity.verifiedOwner ?? "Not returned"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Verified at</dt>
              <dd className="mt-1">
                {selectedAgent.identity.verifiedAt
                  ? dateLabel(selectedAgent.identity.verifiedAt)
                  : "Not verified"}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-muted">Registration URI</dt>
              <dd className="mt-1 break-all font-mono">
                {selectedAgent.identity.registrationURI ?? "Not returned"}
              </dd>
            </div>
          </dl>
          {rotateFormOpen && (
            <div className="mt-5 grid gap-3 rounded-md border border-brand/15 bg-brand-soft/30 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-xs font-medium">
                New EOA signer address
                <input
                  spellCheck={false}
                  value={newSignerAddress}
                  onChange={(event) => setNewSignerAddress(event.target.value)}
                  className="h-10 rounded-md border border-border bg-white px-3 font-mono text-xs font-normal"
                  placeholder="0x…"
                />
                <span className="font-normal leading-5 text-muted">
                  The new signer must connect and sign an agent-bound proof. The
                  owner session is still checked separately by PACT.
                </span>
              </label>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busyAction === selectedAgent.agentId}
                  onClick={() => setRotateFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    busyAction === selectedAgent.agentId || !newSignerAddress
                  }
                  onClick={() => void rotateSigner(selectedAgent)}
                >
                  {busyAction === selectedAgent.agentId
                    ? "Waiting for wallet…"
                    : "Sign and rotate"}
                </Button>
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <p className="mr-auto max-w-md text-[11px] leading-5 text-muted">
              Identity is registry metadata. Spending requires a separate
              capability enforced by the treasury contract.
            </p>
            <Button
              variant="secondary"
              disabled={busyAction === selectedAgent.agentId}
              onClick={() => void verifyIdentity(selectedAgent)}
            >
              {busyAction === selectedAgent.agentId ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Re-verify identity
            </Button>
            {selectedAgent.status !== "REVOKED" && !rotateFormOpen && (
              <Button
                variant="secondary"
                onClick={() => {
                  setNewSignerAddress("");
                  setRotateFormOpen(true);
                  setActionError("");
                }}
              >
                Rotate signer
              </Button>
            )}
            {selectedAgent.status !== "REVOKED" && (
              <Button
                variant="secondary"
                disabled={busyAction === selectedAgent.agentId}
                className="border-danger/30 text-danger hover:bg-danger-soft"
                onClick={() => setRevokeTarget(selectedAgent)}
              >
                <ShieldAlert size={14} />
                Revoke PACT access
              </Button>
            )}
          </div>
        </Card>
      )}

      <dialog
        ref={revokeDialog}
        role="alertdialog"
        aria-labelledby="revoke-title"
        aria-describedby="revoke-description"
        onCancel={(event) => {
          event.preventDefault();
          setRevokeTarget(null);
        }}
        onClose={() => setRevokeTarget(null)}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-white p-5 shadow-xl backdrop:bg-slate-950/40"
      >
        {revokeTarget && (
          <>
            <h2 id="revoke-title" className="text-base font-semibold">
              Revoke PACT access?
            </h2>
            <p
              id="revoke-description"
              className="mt-2 text-sm leading-6 text-muted"
            >
              This asks the backend to revoke{" "}
              <strong>{revokeTarget.name}</strong>. Future PACT requests for
              this agent should fail. This does not revoke the ERC-8004 identity
              on its registry.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={busyAction === revokeTarget.agentId}
                onClick={() => setRevokeTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="border-danger bg-danger hover:bg-danger/90"
                disabled={busyAction === revokeTarget.agentId}
                onClick={() => void revokeAgent(revokeTarget)}
              >
                {busyAction === revokeTarget.agentId
                  ? "Revoking…"
                  : "Confirm revoke"}
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
