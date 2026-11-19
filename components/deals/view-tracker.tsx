"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Registra la vista (RPC con reglas en BD: no cuenta al dueño ni deals no publicados). */
export function ViewTracker({ dealId }: { dealId: string }) {
  useEffect(() => { void createClient().rpc("record_deal_view", { p_deal: dealId }); }, [dealId]);
  return null;
}
