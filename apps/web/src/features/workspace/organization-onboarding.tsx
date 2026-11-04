"use client";

import { useState } from "react";
import { createOrganizationSchema } from "@pact/shared";
import { apiRequest, apiErrorMessage } from "@/lib/api";
import { organizationSchema } from "./schemas";
import { useWorkspace } from "./workspace-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function OrganizationOnboarding() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [createdOrganization, setCreatedOrganization] = useState<{
    organizationId: string;
    name: string;
    status: "ACTIVE" | "SUSPENDED";
    wallet?: { address: string; type: "MERA" | "EOA" | "SMART_ACCOUNT" };
  } | null>(null);
  const { setOrganizationId } = useWorkspace();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const parsed = createOrganizationSchema.safeParse({ name, slug });
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message ?? "Check the organization details.",
      );
      return;
    }
    setBusy(true);
    try {
      const created = await apiRequest(
        "/v1/organizations",
        organizationSchema,
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      setOrganizationId(created.organizationId);
      setCreatedOrganization(created);
      setMessage(
        "Organization created and selected. Wallet verification is a separate step.",
      );
    } catch (error) {
      setMessage(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <Card className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Create an organization</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">
              Organization creation uses the existing authenticated API. The
              backend has no sign-in or session creation route, so this form
              requires a valid session supplied by the deployment.
            </p>
          </div>
          <Badge tone="warning">Authentication dependency</Badge>
        </div>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-xs font-medium">
            Organization name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-md border border-border bg-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              placeholder="Company name"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            Organization slug
            <input
              required
              minLength={3}
              maxLength={63}
              value={slug}
              onChange={(event) =>
                setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              className="h-10 rounded-md border border-border bg-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              placeholder="company-name"
            />
            <span className="font-normal text-muted">
              Lowercase letters, numbers and single hyphens.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create organization"}
            </Button>
            <span className="text-xs text-muted">
              No organization is shown as created until the API confirms it.
            </span>
          </div>
          {message && (
            <p
              aria-live="polite"
              role="status"
              className="rounded-md border border-border bg-background px-3 py-2.5 text-xs leading-5 text-muted"
            >
              {message}
            </p>
          )}
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Wallet verification</h2>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          The API accepts an organization-bound signature but provides no
          challenge endpoint or nonce. Wallet linking is withheld until the
          backend supplies replay-resistant challenge issuance. Account session
          and proof of wallet ownership remain separate.
        </p>
      </Card>
      {createdOrganization && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Organization created</h2>
              <p className="mt-1 text-xs text-muted">
                {createdOrganization.name} ·{" "}
                {createdOrganization.organizationId}
              </p>
            </div>
            <Badge
              tone={
                createdOrganization.status === "ACTIVE" ? "success" : "warning"
              }
            >
              {createdOrganization.status}
            </Badge>
          </div>
          <ol className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
            <li className="rounded-md border border-border bg-background p-3">
              <strong>1. Organization</strong>
              <p className="mt-1 text-muted">Created by the API.</p>
            </li>
            <li className="rounded-md border border-border bg-background p-3">
              <strong>2. Company wallet</strong>
              <p className="mt-1 text-muted">
                {createdOrganization.wallet
                  ? "Verified wallet linked."
                  : "Not linked. A replay-resistant signing challenge is required."}
              </p>
            </li>
            <li className="rounded-md border border-border bg-background p-3">
              <strong>3. Treasury</strong>
              <p className="mt-1 text-muted">
                Not ready until wallet verification and deployment confirmation.
              </p>
            </li>
          </ol>
        </Card>
      )}
      <p className="text-xs text-muted">
        The organization record includes its status and verified wallet only
        after the API returns them. Treasury setup follows wallet verification
        and a confirmed deployment.
      </p>
    </div>
  );
}
