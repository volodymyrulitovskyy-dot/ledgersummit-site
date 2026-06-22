"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type OrgPeriodState = {
  orgId: string;
  orgName: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

type Ctx = {
  state: OrgPeriodState;
  isLoaded: boolean;
  setState: (patch: Partial<OrgPeriodState>) => void;
  withParams: (
    href: string,
    extra?: Partial<Pick<OrgPeriodState, "orgId" | "from" | "to">>
  ) => string;
};

const DEFAULT_STATE: OrgPeriodState = {
  orgId: "",
  orgName: "",
  from: "",
  to: "",
};

const OrgPeriodContext = createContext<Ctx | null>(null);

export function OrgPeriodProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OrgPeriodState>(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Fetch org/period from API endpoint (reads httpOnly cookies server-side)
  useEffect(() => {
    async function fetchActive() {
      try {
        const resp = await fetch('/api/active', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error("GET /api/active failed", resp.status, text);
          return;
        }
        const data = await resp.json();
        setState((prev) => {
          if (
            prev.orgId === data.orgId &&
            prev.from === data.from &&
            prev.to === data.to
          ) {
            return prev; // No change
          }
          return {
            orgId: data.orgId || '',
            orgName: data.orgName || '',
            from: data.from || '',
            to: data.to || '',
          };
        });
      } catch (error) {
        console.error('Failed to fetch active org/period:', error);
      } finally {
        setIsLoaded(true);
      }
    }

    fetchActive();

    // DEV: disable polling while we binary-search compile hangs
    // const interval = setInterval(fetchActive, 2000);
    // return () => clearInterval(interval);
  }, []);

  const _setState = (patch: Partial<OrgPeriodState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const withParams = (
    href: string,
    extra?: Partial<Pick<OrgPeriodState, "orgId" | "from" | "to">>
  ) => {
    const u = new URL(href, "http://local");
    const orgId = extra?.orgId ?? state.orgId;
    const from = extra?.from ?? state.from;
    const to = extra?.to ?? state.to;

    if (orgId) u.searchParams.set("orgId", orgId);
    if (from) u.searchParams.set("from", from);
    if (to) u.searchParams.set("to", to);

    return u.pathname + "?" + u.searchParams.toString();
  };

  const value = useMemo<Ctx>(() => ({ state, isLoaded, setState: _setState, withParams }), [state, isLoaded]);

  return <OrgPeriodContext.Provider value={value}>{children}</OrgPeriodContext.Provider>;
}

export function useOrgPeriod() {
  const ctx = useContext(OrgPeriodContext);
  if (!ctx) throw new Error("useOrgPeriod must be used within OrgPeriodProvider");
  return ctx;
}

