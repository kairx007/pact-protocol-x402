import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceProvider } from "@/features/workspace/workspace-context";

export const metadata: Metadata = {
  title: "PACT | Organization Console",
  description: "Financial authority console for autonomous agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          className="fixed left-2 top-2 z-[100] -translate-y-[150%] rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition-transform focus:translate-y-0"
          href="#main-content"
        >
          Skip to content
        </a>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
