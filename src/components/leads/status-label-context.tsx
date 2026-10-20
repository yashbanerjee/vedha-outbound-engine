"use client";

import { createContext, useContext } from "react";
import type { LeadStatus } from "@prisma/client";
import { LEAD_STATUS_LABEL } from "@/lib/leads/constants";
import type { StatusLabels } from "@/lib/leads/status-labels";

const StatusLabelContext = createContext<StatusLabels>(LEAD_STATUS_LABEL);

export function StatusLabelProvider({ labels, children }: { labels: StatusLabels; children: React.ReactNode }) {
  return <StatusLabelContext.Provider value={labels}>{children}</StatusLabelContext.Provider>;
}

export function useStatusLabels() {
  return useContext(StatusLabelContext);
}

export function useStatusLabel(status: LeadStatus) {
  return useContext(StatusLabelContext)[status];
}
