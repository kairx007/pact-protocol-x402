"use client";

import { useState } from "react";
import { Bell, ChevronDown, CircleUserRound, Menu, Search } from "lucide-react";
import type { Environment } from "@pact/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const environmentLabels: Record<Environment, string> = {
  local: "Local · Non-production",
  devnet: "Monad Devnet · Non-production",
  testnet: "Monad Testnet · Non-production",
  mainnet: "Monad Mainnet",
};

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const [openMenu, setOpenMenu] = useState<
    "organization" | "profile" | "notifications" | null
  >(null);
  const toggle = (menu: typeof openMenu) =>
    setOpenMenu((current) => (current === menu ? null : menu));
  const environment = process.env.NEXT_PUBLIC_PACT_ENVIRONMENT;
  const networkLabel =
    environment && Object.hasOwn(environmentLabels, environment)
      ? environmentLabels[environment as Environment]
      : "Environment not configured";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-3 sm:px-6 lg:px-10">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </Button>
        <div className="relative">
          <button
            className="flex items-center gap-2.5 rounded-md py-1 text-left hover:opacity-80"
            onClick={() => toggle("organization")}
            aria-expanded={openMenu === "organization"}
          >
            <span className="grid size-8 place-items-center rounded-md border border-border bg-surface-muted text-xs font-semibold text-brand">
              P
            </span>
            <span className="grid gap-0.5">
              <strong className="max-w-32 truncate text-xs font-medium text-foreground">
                No organization
              </strong>
              <small className="text-[11px] text-muted">Workspace</small>
            </span>
            <ChevronDown size={14} className="text-subtle" aria-hidden="true" />
          </button>
          {openMenu === "organization" && (
            <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-lg">
              <strong className="text-xs font-semibold">Organization</strong>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                Sign in and create or select an organization to continue.
              </p>
              <span className="mt-2.5 block text-[11px] text-subtle">
                Organization data is not connected yet
              </span>
            </div>
          )}
        </div>
        <span className="hidden h-6 w-px bg-border sm:block" />
        <Badge
          tone="neutral"
          className="max-w-44 truncate border border-border bg-surface text-[10px] font-medium sm:max-w-none"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-subtle" />
          {networkLabel}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <label className="hidden h-9 w-48 items-center gap-2 rounded-md border border-border bg-background px-3 text-subtle md:flex">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search (not available yet)"
            disabled
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px]">
            ⌘ K
          </kbd>
        </label>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted"
            aria-label="Notifications unavailable"
            onClick={() => toggle("notifications")}
          >
            <Bell size={18} />
          </Button>
          {openMenu === "notifications" && (
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-lg">
              <strong className="text-xs font-semibold">Notifications</strong>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                Notifications will appear here when a notification service is
                available.
              </p>
            </div>
          )}
        </div>
        <span className="hidden h-6 w-px bg-border sm:block" />
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-md py-1 text-left hover:opacity-80"
            onClick={() => toggle("profile")}
            aria-expanded={openMenu === "profile"}
          >
            <span className="grid size-8 place-items-center rounded-full border border-border bg-surface-muted text-muted">
              <CircleUserRound size={18} />
            </span>
            <span className="hidden gap-0.5 sm:grid">
              <strong className="text-xs font-medium">Account</strong>
              <small className="text-[11px] text-muted">Not signed in</small>
            </span>
            <ChevronDown
              size={14}
              className="hidden text-subtle sm:block"
              aria-hidden="true"
            />
          </button>
          {openMenu === "profile" && (
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-lg">
              <strong className="text-xs font-semibold">Account</strong>
              <p className="mt-1.5 text-xs leading-5 text-muted">
                Authentication and account settings will be available in a later
                phase.
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
