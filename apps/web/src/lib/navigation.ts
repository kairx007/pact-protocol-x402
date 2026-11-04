import {
  Activity,
  BarChart3,
  Bot,
  Braces,
  CreditCard,
  Fingerprint,
  LayoutDashboard,
  ScrollText,
  Settings2,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const primaryNavigation: NavigationItem[] = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Treasury", href: "/treasury", icon: Wallet },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Capabilities", href: "/capabilities", icon: Fingerprint },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Approvals", href: "/approvals", icon: Activity },
  { label: "Guardrails", href: "/guardrails", icon: ShieldCheck },
  { label: "Audit Trail", href: "/audit", icon: ScrollText },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];

export const secondaryNavigation: NavigationItem[] = [
  { label: "Developers", href: "/developers", icon: Braces },
  { label: "Settings", href: "/settings", icon: Settings2 },
];

export const routeDescriptions: Record<string, string> = {
  "/overview":
    "A clear view of your organization’s financial activity and agent authority.",
  "/treasury": "View treasury configuration and on-chain activity.",
  "/agents": "Manage agent identities and their lifecycle.",
  "/capabilities": "Review bounded spending authority and delegation.",
  "/payments":
    "Track payment authorization, reservation and settlement separately.",
  "/approvals": "Review payment intents that require owner authorization.",
  "/guardrails": "Manage organization policies that constrain agent activity.",
  "/audit": "Trace security and financial events across the organization.",
  "/analytics":
    "Understand spending and operational patterns from verified data.",
  "/developers": "Connect applications using supported PACT interfaces.",
  "/settings": "Manage organization and account preferences.",
};
