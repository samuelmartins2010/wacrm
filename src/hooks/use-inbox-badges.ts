"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { activeFlowConversationIds } from "@/lib/inbox/badges";

export interface InboxBadgeContext {
  /** I.A ligada, com chave, e resposta automática ligada. */
  aiActive: boolean;
  autoReplyEnabled: boolean;
  /** Existe automação ativa que responde mensagem (a I.A fica de fora). */
  autoRespondersActive: boolean;
  /** Conversas com fluxo em andamento (execução ativa e não vencida). */
  flowConversationIds: Set<string>;
}

const EMPTY: InboxBadgeContext = {
  aiActive: false,
  autoReplyEnabled: false,
  autoRespondersActive: false,
  flowConversationIds: new Set(),
};

async function fetchFlowConversationIds(): Promise<Set<string> | null> {
  const { data, error } = await createClient()
    .from("flow_runs")
    .select("conversation_id, last_advanced_at, flows(fallback_policy)")
    .eq("status", "active");
  if (error) {
    console.error("Failed to load active flow runs:", error.message);
    return null;
  }
  type Row = {
    conversation_id: string | null;
    last_advanced_at: string;
    flows: { fallback_policy: unknown } | { fallback_policy: unknown }[] | null;
  };
  const runs = ((data ?? []) as Row[]).map((r) => ({
    conversation_id: r.conversation_id,
    last_advanced_at: r.last_advanced_at,
    fallback_policy: Array.isArray(r.flows) ? r.flows[0]?.fallback_policy : r.flows?.fallback_policy,
  }));
  return activeFlowConversationIds(runs, new Date());
}

/**
 * O que os selos "🤖 I.A atendendo" / "🤖 Fluxo em andamento" precisam
 * saber além da própria conversa. Configuração da I.A e automações são
 * lidas uma vez; os fluxos ativos são relidos com `refreshFlows`
 * (chamado junto com os contadores).
 */
export function useInboxBadges(): { context: InboxBadgeContext; refreshFlows: () => void } {
  const [context, setContext] = useState<InboxBadgeContext>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [aiRes, autoRes] = await Promise.all([
        fetch("/api/ai/config", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        supabase
          .from("automations")
          .select("id")
          .eq("is_active", true)
          .in("trigger_type", ["new_message_received", "keyword_match"])
          .limit(1),
      ]);
      if (cancelled) return;
      const ai = aiRes as { configured?: boolean; has_key?: boolean; is_active?: boolean; auto_reply_enabled?: boolean } | null;
      setContext((prev) => ({
        ...prev,
        aiActive: !!(ai?.configured && ai.has_key && ai.is_active),
        autoReplyEnabled: !!ai?.auto_reply_enabled,
        autoRespondersActive: (autoRes.data ?? []).length > 0,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFlows = useCallback(() => {
    void fetchFlowConversationIds().then((ids) => {
      if (ids) setContext((prev) => ({ ...prev, flowConversationIds: ids }));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFlowConversationIds().then((ids) => {
      if (!cancelled && ids) setContext((prev) => ({ ...prev, flowConversationIds: ids }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { context, refreshFlows };
}
