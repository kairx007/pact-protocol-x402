"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Workspace = {
  organizationId: string;
  treasuryId: string;
  setOrganizationId: (value: string) => void;
  setTreasuryId: (value: string) => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [organizationId, setOrganization] = useState("");
  const [treasuryId, setTreasury] = useState("");

  useEffect(() => {
    setOrganization(window.localStorage.getItem("pact.organizationId") ?? "");
    setTreasury(window.localStorage.getItem("pact.treasuryId") ?? "");
  }, []);

  const value = useMemo<Workspace>(
    () => ({
      organizationId,
      treasuryId,
      setOrganizationId: (next) => {
        setOrganization(next);
        if (next) window.localStorage.setItem("pact.organizationId", next);
        else window.localStorage.removeItem("pact.organizationId");
      },
      setTreasuryId: (next) => {
        setTreasury(next);
        if (next) window.localStorage.setItem("pact.treasuryId", next);
        else window.localStorage.removeItem("pact.treasuryId");
      },
    }),
    [organizationId, treasuryId],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context)
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
