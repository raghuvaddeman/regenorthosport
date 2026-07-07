"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCalls, type Call } from "@/lib/use-calls";

type CallsContextValue = {
  calls: Call[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CallsContext = createContext<CallsContextValue | null>(null);

export function CallsProvider({ children }: { children: ReactNode }) {
  const { calls, loading, error, refresh } = useCalls(30_000);

  return (
    <CallsContext.Provider value={{ calls, loading, error, refresh }}>
      {children}
    </CallsContext.Provider>
  );
}

export function useCallsContext(): CallsContextValue {
  const ctx = useContext(CallsContext);
  if (!ctx) {
    throw new Error("useCallsContext must be used within CallsProvider");
  }
  return ctx;
}
