"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, ShieldCheck, X } from "lucide-react";
import { primaryNavigation, secondaryNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  function renderLinks(items: typeof primaryNavigation) {
    return items.map(({ href, label, icon: Icon }) => {
      const active =
        pathname === href ||
        (href !== "/overview" && pathname.startsWith(`${href}/`));
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
          className={cn(
            "relative flex min-h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground",
            active &&
              "bg-brand-soft/70 text-brand before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-brand hover:bg-brand-soft/70 hover:text-brand",
          )}
        >
          <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      );
    });
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex-col border-r border-border bg-surface px-3 py-5",
        onClose ? "flex w-[min(18rem,84vw)] shadow-2xl" : "hidden w-60 md:flex",
      )}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-between px-2 pb-8">
        <Link
          href="/overview"
          className="inline-flex items-center gap-2.5 text-brand"
          onClick={onNavigate}
          aria-label="PACT home"
        >
          <span className="grid size-8 place-items-center rounded-md bg-brand text-white">
            <Command size={17} strokeWidth={2.2} />
          </span>
          <span className="text-lg font-bold tracking-tight">PACT</span>
        </Link>
        {onClose && (
          <button
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted md:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        )}
      </div>
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
        Workspace
      </div>
      <nav className="grid gap-1">{renderLinks(primaryNavigation)}</nav>
      <div className="mt-7 border-t border-border pt-5">
        <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
          Manage
        </div>
        <nav className="grid gap-1">{renderLinks(secondaryNavigation)}</nav>
      </div>
      <div className="mt-auto pt-6">
        <div className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-muted">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-brand"
            aria-hidden="true"
          />
          <div className="grid gap-1">
            <strong className="text-xs font-medium text-foreground">
              Authority stays bounded
            </strong>
            <span className="text-[11px] leading-4">
              Enforced by smart contracts
            </span>
          </div>
        </div>
        <div className="flex justify-between px-1 pt-4 text-[11px] text-muted">
          <span>PACT Console</span>
          <span className="text-subtle">Foundation</span>
        </div>
      </div>
    </aside>
  );
}
