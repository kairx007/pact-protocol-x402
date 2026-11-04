"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageHeader } from "@/components/ui/page-header";
import { routeDescriptions } from "@/lib/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const title =
    pathname === "/"
      ? "Overview"
      : (pathname.split("/").filter(Boolean).at(-1) ?? "Overview");
  const pageTitle = title
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  useEffect(() => setMobileNavOpen(false), [pathname]);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="min-h-screen md:pl-60">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9"
        >
          <PageHeader
            title={pageTitle}
            description={
              routeDescriptions[pathname] ?? "PACT organization workspace."
            }
          />
          {children}
        </main>
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 size-full border-0 bg-slate-950/30"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            onNavigate={() => setMobileNavOpen(false)}
            onClose={() => setMobileNavOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
