"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface InboxCounts {
  mine: number;
  unassigned: number;
  awaiting: number;
  unread: number;
}

async function fetchInboxCounts(): Promise<InboxCounts | null> {
  const { data, error } = await createClient().rpc("inbox_filter_counts");
  if (error) {
    console.error("Failed to load inbox counts:", error.message);
    return null;
  }
  return ((Array.isArray(data) ? data[0] : data) as InboxCounts | undefined) ?? null;
}

/**
 * Contadores dos filtros rápidos do Inbox (RPC `inbox_filter_counts`,
 * migration 057 — limitada pela RLS à conta de quem chama). `refresh`
 * agrupa chamadas seguidas (1 s), para uma rajada de eventos de tempo
 * real virar uma consulta só.
 */
export function useInboxCounts(): { counts: InboxCounts | null; refresh: () => void } {
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    void fetchInboxCounts().then((row) => {
      if (row) setCounts(row);
    });
  }, []);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      load();
    }, 1000);
  }, [load]);

  useEffect(() => {
    fetchInboxCounts().then((row) => {
      if (row) setCounts(row);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { counts, refresh };
}
